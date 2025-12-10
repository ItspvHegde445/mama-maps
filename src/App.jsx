import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp, doc, getDoc, setDoc, increment, orderBy, limit } from 'firebase/firestore';
import { Camera, Shield, X, Check, Search, User, Navigation as NavIcon, ArrowUpDown, Radio, Clock, AlertTriangle, Loader2, MapPin } from 'lucide-react';

// ==========================================
// 1. CONFIGURATION & INITIALIZATION
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyCC68T-FM44veKyr7kB8Y5mpMOKDSVxbZQ",
  authDomain: "mama-maps-16f8f.firebaseapp.com",
  projectId: "mama-maps-16f8f",
  storageBucket: "mama-maps-16f8f.firebasestorage.app",
  messagingSenderId: "118465167658",
  appId: "1:118465167658:android:7a062cf67cd819487ede53",
};

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = "AIzaSyCwNrhx7F01mLhSFTEAlKnSgNLB_aJskR4"; 

// Initialize Firebase Services
const app = initializeApp(Object.keys(firebaseConfig).length > 0 ? firebaseConfig : { apiKey: "placeholder", projectId: "placeholder" });
const auth = getAuth(app);
const db = getFirestore(app);


// ==========================================
// 2. CONSTANTS & UTILITIES
// ==========================================

const RANKS = [
  { name: 'Constable', minPoints: 0 },
  { name: 'Head Constable', minPoints: 20 },
  { name: 'Sub Inspector', minPoints: 50 },
  { name: 'Inspector', minPoints: 100 },
  { name: 'DCP', minPoints: 200 },
  { name: 'Commissioner', minPoints: 400 },
];

/**
 * Calculates user rank based on total points.
 */
const getRankForPoints = (points) => {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (points >= r.minPoints) current = r;
  }
  return current;
};

/**
 * Loads the Google Maps JavaScript API dynamically.
 */
const loadGoogleMapsScript = (apiKey) => {
  return new Promise((resolve) => {
    if (window.google && window.google.maps) { resolve(window.google.maps); return; }
    if (document.querySelector(`script[src*="maps.googleapis.com"]`)) {
       const i = setInterval(() => { if(window.google) { clearInterval(i); resolve(window.google.maps); } }, 100);
       return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,drawing`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    document.head.appendChild(script);
  });
};

/**
 * Calculates distance between two coordinates in meters.
 */
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d * 1000; // Return meters
};

// ==========================================
// 3. SUB-COMPONENTS
// ==========================================

const GooglePlacesInput = ({ placeholder, value, onChange, onSelect, icon: Icon }) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    let autocomplete;
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then(() => {
      if (!window.google || !inputRef.current) return;

      const options = {
        fields: ['geometry', 'name', 'formatted_address'],
        componentRestrictions: { country: ['in'] },
      };
      
      // Bias to Bengaluru area
      options.bounds = new window.google.maps.LatLngBounds(
        new window.google.maps.LatLng(12.8, 77.35),
        new window.google.maps.LatLng(13.15, 77.85)
      );

      autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, options);
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry) {
          onChange(place.name);
          onSelect({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            name: place.name,
          });
        }
      });
      autocompleteRef.current = autocomplete;
    });

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  return (
    <div className="relative flex-1 group">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10 pointer-events-none">
        {Icon ? <Icon size={18} /> : <Search size={18} />}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white text-gray-900 pl-10 pr-4 py-3 rounded-xl text-sm font-medium shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

const GoogleMapComponent = ({ center, source, dest, reports, onRouteInfo, onMarkerClick }) => {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const dirService = useRef(null);
  const dirRender = useRef(null);
  const markers = useRef([]);

  // Initialize Map
  useEffect(() => {
    if (window.google && !mapObj.current) {
      mapObj.current = new window.google.maps.Map(mapRef.current, {
        center: center,
        zoom: 15,
        disableDefaultUI: true,
        styles: [
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
        ]
      });
      dirService.current = new window.google.maps.DirectionsService();
      dirRender.current = new window.google.maps.DirectionsRenderer({
        map: mapObj.current,
        suppressMarkers: false,
        polylineOptions: { strokeColor: "#2563eb", strokeWeight: 6 }
      });
    }
  }, []);

  // Update Markers when reports change
  useEffect(() => {
    if (!mapObj.current) return;
    
    // Clear old markers
    markers.current.forEach(m => m.setMap(null));
    markers.current = [];

    reports.forEach(r => {
      let emojiLabel = "📍";
      if (r.type === 'cop') emojiLabel = "👮";
      if (r.type === 'trash') emojiLabel = "🗑️";
      if (r.type === 'pothole') emojiLabel = "⚠️";

      const m = new window.google.maps.Marker({
        position: { lat: r.lat, lng: r.lng },
        map: mapObj.current,
        label: {
          text: emojiLabel,
          fontSize: "24px",
          className: "map-emoji-marker"
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 0, 
        }
      });

      m.addListener("click", () => {
        if (onMarkerClick) onMarkerClick(r);
      });

      markers.current.push(m);
    });
  }, [reports]);

  // Update Route when source/dest changes
  useEffect(() => {
      if (source && dest && dirService.current) {
          dirService.current.route({
              origin: source.lat ? source : source.name,
              destination: dest.lat ? dest : dest.name,
              travelMode: 'DRIVING'
          }, (res, status) => {
              if (status === 'OK') {
                  dirRender.current.setDirections(res);
                  const leg = res.routes[0].legs[0];
                  onRouteInfo({ distance: leg.distance.text, duration: leg.duration.text });
              }
          });
      }
  }, [source, dest]);

  return <div ref={mapRef} className="w-full h-full" />;
};

const AuthScreen = () => {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-lg p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-bold text-lg">MAMA MAPS</span>
        </div>
        <h2 className="text-xl font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-black text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Please wait..." : isSignup ? "Sign up" : "Log in"}
          </button>
        </form>
        <button className="w-full text-xs text-gray-600 mt-2" onClick={() => setIsSignup((v) => !v)}>
          {isSignup ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
};

// Report Modal Component

const ReportModal = ({ isOpen, onClose, onSubmit, isUploading }) => {
  const [reportType, setReportType] = useState('trash');

  if (!isOpen) return null;

const handleCameraClick = async () => {
    try {
      // 1. Force Camera + Use Base64 (Memory) to avoid Disk Permission Errors
      const image = await CapCamera.getPhoto({
        quality: 60, // Reduced quality slightly to prevent memory crash
        allowEditing: false,
        resultType: CameraResultType.Base64, // <--- THIS IS THE MAGIC FIX
        source: CameraSource.Camera 
      });

      // 2. Convert the Base64 string to a Blob (File) for upload
      const base64Data = `data:image/jpeg;base64,${image.base64String}`;
      const response = await fetch(base64Data);
      const blob = await response.blob();

      // 3. Send to upload function
      onSubmit(reportType, blob);

    } catch (error) {
      console.error("Camera error:", error);
      // Only alert if it's a real error, not just the user cancelling
      if (error.message !== 'User cancelled photos app') {
        alert("Camera Issue: " + error.message);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 z-50 pointer-events-auto animate-in slide-in-from-bottom">
        <h3 className="font-bold text-lg mb-4 text-black">Report an Issue</h3>
        
        <div className="grid grid-cols-3 gap-3 mb-6">
          {['trash', 'cop', 'pothole'].map((type) => (
            <button
              key={type}
              onClick={() => setReportType(type)}
              className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                reportType === type ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-gray-200'
              }`}
            >
              <span className="capitalize text-sm font-medium text-black">{type}</span>
            </button>
          ))}
        </div>

        {/* Updated Button: Calls handleCameraClick instead of file input */}
        <button
          disabled={isUploading}
          onClick={handleCameraClick}
          className="w-full bg-yellow-400 text-black font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform flex justify-center items-center gap-2"
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <Camera size={20} />}
          {isUploading ? "Uploading..." : "Take Photo & Report"}
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 4. MAIN APP COMPONENT
// ==========================================

export default function App() {
  // State: System
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  
  // State: Data
  const [reports, setReports] = useState([]);
  const [profile, setProfile] = useState({ points: 0, reportsCount: 0 });
  
  // State: Map & Nav
  const [currentLoc, setCurrentLoc] = useState({ lat: 12.9716, lng: 77.5946 });
  const [source, setSource] = useState(null);
  const [dest, setDest] = useState(null);
  const [sourceQuery, setSourceQuery] = useState('Current Location');
  const [destQuery, setDestQuery] = useState('');
  const [routeInfo, setRouteInfo] = useState(null);
  
  // State: UI
  const [showReportModal, setShowReportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // --- Effect 1: Initialization & Auth ---
  useEffect(() => {
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then(() => setLoading(false));
    
    // Clear old sessions
    signOut(auth).catch((e) => console.log("Signout ignore:", e?.message));

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
      setAuthReady(true);
    });

    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        setCurrentLoc(loc);
        setSource(loc);
      },
      () => console.warn("GPS denied")
    );
    return () => unsub();
  }, []);

  // --- Effect 2: Load User Profile ---
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const init = async () => {
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, { email: user.email, createdAt: serverTimestamp(), points: 0, reportsCount: 0 });
        setProfile({ points: 0, reportsCount: 0 });
      } else {
        setProfile(snap.data());
      }
    };
    init();
  }, [user]);

  // --- Effect 3: Live Reports Listener ---
  useEffect(() => {
    // Listen for last 50 reports
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      setReports(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        lat: Number(doc.data().lat), // Ensure number
        lng: Number(doc.data().lng)  // Ensure number
      })));
    });
    return () => unsub();
  }, []);

  // --- Action: Award Points ---
  const awardPoints = async (amount = 5) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { points: increment(amount), reportsCount: increment(1) }, { merge: true });
      setProfile((prev) => ({ ...prev, points: (prev.points || 0) + amount, reportsCount: (prev.reportsCount || 0) + 1 }));
    } catch (e) {
      console.error('Failed to award points', e);
    }
  };

  // --- Action: Swap Locations ---
  const swapLoc = () => {
    const tQ = sourceQuery; const tL = source;
    setSourceQuery(destQuery); setSource(dest);
    setDestQuery(tQ); setDest(tL);
  };

  // --- Action: Submit New Report ---a

  // --- Action: Submit New Report (Using Cloudinary) ---
  const handleSubmitReport = async (type, file) => {
    if (!user || !currentLoc) return;
    setIsUploading(true);

    try {
      // 1. Upload Image to Cloudinary
      const data = new FormData();
      data.append("file", file);
      data.append("upload_preset", "mamamaps_preset"); 
      data.append("cloud_name", "dli9rzoef"); 

      // FIXED URL HERE:
      const res = await fetch("https://api.cloudinary.com/v1_1/dli9rzoef/image/upload", { 
        method: "post",
        body: data
      });

      const json = await res.json();
      
      if (!json.secure_url) {
        throw new Error("Image upload failed: " + (json.error?.message || "Unknown error"));
      }

      const downloadURL = json.secure_url; 

      // 2. Save Data to Firestore
      await addDoc(collection(db, "reports"), {
        lat: currentLoc.lat,
        lng: currentLoc.lng,
        type: type,
        imageUrl: downloadURL,
        createdAt: serverTimestamp(),
        reporterId: user.uid,
        verifiedCount: 0,
        status: 'active'
      });

      // 3. Reward
      await awardPoints(10);
      setShowReportModal(false);
    } catch (e) {
      console.error("Error reporting:", e);
      alert("Upload failed. Check your connection.");
    } finally {
      setIsUploading(false);
    }
  };

  // --- Action: Click Marker ---
  const handleMarkerClick = (report) => {
    const dist = getDistanceFromLatLonInMeters(currentLoc.lat, currentLoc.lng, report.lat, report.lng);
    setSelectedReport({ ...report, distanceAway: Math.round(dist) });
  };

  // --- Action: Verify Report ---
  const handleVerify = async (isValid) => {
    if (!selectedReport || !user) return;
    const reportRef = doc(db, "reports", selectedReport.id);
    await setDoc(reportRef, { verifiedCount: increment(isValid ? 1 : -1) }, { merge: true });
    await awardPoints(5); // Reward verifier
    setSelectedReport(null);
  };

  // --- Render Loading / Auth ---
  if (loading || !authReady) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
 if (!user) return (
  <Login
   
     onSubmit={async ({email, password}) => {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        alert(err.message);
      }
    }}
    onSignUp={async ({email, password}) => {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (err) {
        alert(err.message);
      }
    }}
    onSocial={() => alert('Social login coming soon')}
  />
);


  // --- Render Main UI ---
  return (
    <div className="h-screen w-full flex flex-col bg-white relative font-sans">
      
      {/* 1. Header & Search Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 z-20 flex flex-col gap-3 pointer-events-none">
        <div className="flex justify-between items-center pointer-events-auto">
          <div className="bg-white shadow-md px-4 py-2 rounded-full flex items-center gap-2 border border-gray-100">
            <Shield className="text-black fill-current" size={18} />
            <span className="text-black font-bold text-sm tracking-tight">MAMA MAPS</span>
          </div>
          <div className="flex gap-2 items-center">
            <button className="bg-white p-2 rounded-full shadow-md border border-gray-100 text-gray-600">
              <Radio size={18} />
            </button>
            <div className="bg-black text-white px-4 py-2 rounded-full text-xs font-bold flex flex-col shadow-md">
              <span className="flex items-center gap-1"><User size={14} />{user?.email || "Officer"}</span>
              <span className="text-[10px] text-yellow-300 mt-0.5">{getRankForPoints(profile.points || 0).name} · {profile.points || 0} pts</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-1.5 rounded-2xl shadow-xl border border-gray-100 pointer-events-auto flex flex-col gap-1">
          <div className="flex gap-2 items-center">
            <GooglePlacesInput placeholder="Start Location" value={sourceQuery} onChange={setSourceQuery} onSelect={(p) => { setSourceQuery(p.name); setSource(p); }} icon={NavIcon} />
            <button onClick={swapLoc} className="bg-gray-50 p-2 rounded-full text-gray-500 hover:bg-gray-100"><ArrowUpDown size={16} /></button>
          </div>
          <div className="h-[1px] bg-gray-100 mx-2" />
          <GooglePlacesInput placeholder="Where to?" value={destQuery} onChange={setDestQuery} onSelect={(p) => { setDestQuery(p.name); setDest(p); }} icon={Search} />
        </div>
      </div>

      {/* 2. Map Canvas */}
      <div className="flex-1 relative z-0">
        <GoogleMapComponent
          center={currentLoc}
          source={source}
          dest={dest}
          reports={reports}
          onRouteInfo={setRouteInfo}
          onMarkerClick={handleMarkerClick}
        />

        {/* 3. Navigation Stats Card */}
        {routeInfo && (
          <div className="absolute bottom-32 left-4 right-4 bg-white p-4 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 z-20 flex justify-between items-center animate-in slide-in-from-bottom">
            <div>
              <p className="text-xs text-green-600 font-bold uppercase mb-0.5">Fastest Route</p>
              <p className="text-2xl font-black text-gray-900">{routeInfo.duration}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-blue-600">{routeInfo.distance}</p>
            </div>
          </div>
        )}

        {/* 4. FAB (Camera Button) */}
        <div className="absolute bottom-8 left-0 w-full flex justify-center z-20 pointer-events-none">
          <button
            onClick={() => setShowReportModal(true)}
            className="pointer-events-auto w-16 h-16 bg-yellow-400 rounded-full border-4 border-white shadow-2xl flex items-center justify-center hover:scale-105 transition-transform text-black"
          >
            <Camera size={28} strokeWidth={2.5} />
          </button>
        </div>

        {/* 5. Modals & Popups */}
        <ReportModal 
          isOpen={showReportModal} 
          onClose={() => setShowReportModal(false)}
          onSubmit={handleSubmitReport}
          isUploading={isUploading}
        />

        {selectedReport && (
          <div className="absolute bottom-0 left-0 w-full z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-5 border border-gray-200 animate-in slide-in-from-bottom">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold capitalize flex items-center gap-2">
                    {selectedReport.type === 'cop' ? '👮 Police Reported' : '🗑️ Trash Reported'}
                  </h3>
                  <p className="text-sm text-gray-500">Reported {selectedReport.distanceAway}m away from you.</p>
                </div>
                <button onClick={() => setSelectedReport(null)} className="p-1 bg-gray-100 rounded-full"><X size={20} /></button>
              </div>
              {selectedReport.imageUrl && (
                <div className="h-32 w-full mb-4 rounded-xl overflow-hidden bg-gray-100">
                  <img src={selectedReport.imageUrl} alt="Report" className="w-full h-full object-cover" />
                </div>
              )}
              {selectedReport.distanceAway < 150 ? (
                <div className="flex gap-3">
                  <button onClick={() => handleVerify(true)} className="flex-1 bg-green-500 text-white py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-transform">Still There (+5 pts)</button>
                  <button onClick={() => handleVerify(false)} className="flex-1 bg-red-100 text-red-600 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">Not There</button>
                </div>
              ) : (
                <div className="bg-gray-100 text-gray-500 p-3 rounded-xl text-center text-xs font-medium">You must be closer to verify this report.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}