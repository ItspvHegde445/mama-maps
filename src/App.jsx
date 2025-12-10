import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp, doc, getDoc, setDoc, increment, orderBy, limit } from 'firebase/firestore';
import { Camera, Shield, X, Check, Search, User, Navigation as NavIcon, ArrowUpDown, Radio, Clock, AlertTriangle, Loader2, MapPin, LogOut } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import Login from './screens/Login'; // <--- THIS USES YOUR ORIGINAL LOGIN FILE

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

const GOOGLE_MAPS_API_KEY = "AIzaSyCwNrhx7F01mLhSFTEAlKnSgNLB_aJskR4"; 

const app = initializeApp(Object.keys(firebaseConfig).length > 0 ? firebaseConfig : { apiKey: "placeholder", projectId: "placeholder" });
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. CONSTANTS & UTILITIES
// ==========================================

const AVATAR_OPTIONS = Array.from({ length: 30 }, (_, i) => 
  `https://api.dicebear.com/7.x/adventurer/svg?seed=${i+1}&backgroundColor=b6e3f4,c0aede,d1d4f9`
);

const RANKS = [
  { name: 'Constable', minPoints: 0 },
  { name: 'Head Constable', minPoints: 20 },
  { name: 'Sub Inspector', minPoints: 50 },
  { name: 'Inspector', minPoints: 100 },
  { name: 'DCP', minPoints: 200 },
  { name: 'Commissioner', minPoints: 400 },
];

const getRankForPoints = (points) => {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (points >= r.minPoints) current = r;
  }
  return current;
};

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

const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; 
  return d * 1000; 
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
        bounds: new window.google.maps.LatLngBounds(
          new window.google.maps.LatLng(12.8, 77.35),
          new window.google.maps.LatLng(13.15, 77.85)
        )
      };

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
      if (autocompleteRef.current) window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
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

  useEffect(() => {
    if (window.google && !mapObj.current) {
      mapObj.current = new window.google.maps.Map(mapRef.current, {
        center: center,
        zoom: 15,
        disableDefaultUI: true,
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }]
      });
      dirService.current = new window.google.maps.DirectionsService();
      dirRender.current = new window.google.maps.DirectionsRenderer({
        map: mapObj.current,
        suppressMarkers: false,
        polylineOptions: { strokeColor: "#2563eb", strokeWeight: 6 }
      });
    }
  }, []);

  useEffect(() => {
    if (!mapObj.current) return;
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
        label: { text: emojiLabel, fontSize: "24px", className: "map-emoji-marker" },
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 0 }
      });
      m.addListener("click", () => { if (onMarkerClick) onMarkerClick(r); });
      markers.current.push(m);
    });
  }, [reports]);

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

const ReportModal = ({ isOpen, onClose, onSubmit, isUploading }) => {
  const [reportType, setReportType] = useState('trash');
  if (!isOpen) return null;

  const handleCameraClick = async () => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 50,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: false
      });
      const base64Data = `data:image/jpeg;base64,${image.base64String}`;
      const response = await fetch(base64Data);
      const blob = await response.blob();
      onSubmit(reportType, blob);
    } catch (error) {
      if (error.message !== 'User cancelled photos app') alert("Camera Issue: " + error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 z-50 pointer-events-auto animate-in slide-in-from-bottom">
        <h3 className="font-bold text-lg mb-4 text-black">Report an Issue</h3>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {['trash', 'cop', 'pothole'].map((type) => (
            <button key={type} onClick={() => setReportType(type)} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${reportType === type ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-gray-200'}`}>
              <span className="capitalize text-sm font-medium text-black">{type}</span>
            </button>
          ))}
        </div>
        <button disabled={isUploading} onClick={handleCameraClick} className="w-full bg-yellow-400 text-black font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform flex justify-center items-center gap-2">
          {isUploading ? <Loader2 className="animate-spin" /> : <Camera size={20} />}
          {isUploading ? "Uploading..." : "Take Photo & Report"}
        </button>
      </div>
    </div>
  );
};

// FIXED PROFILE SETTINGS 
const ProfileSettings = ({ user, profile, onClose, onSave, onLogout }) => {
  const [formData, setFormData] = useState({
    name: profile.name || '',
    username: profile.username || '',
    dob: profile.dob || '',
    avatar: profile.avatar || AVATAR_OPTIONS[0]
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Create or Update profile using setDoc with merge:true
      await setDoc(doc(db, "users", user.uid), {
        name: formData.name,
        username: formData.username,
        dob: formData.dob,
        avatar: formData.avatar
      }, { merge: true });
      
      onSave(formData); // Update local app state
      alert("Profile Saved!");
      onClose();
    } catch (e) {
      alert("Error saving: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col animate-in slide-in-from-right">
      <div className="bg-white p-4 shadow-sm flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 -ml-2 hover:bg-gray-100 rounded-full"><ArrowUpDown className="rotate-90" size={24} /></button>
            <h1 className="text-xl font-bold">Edit Profile</h1>
        </div>
        {/* LOGOUT BUTTON - Click this to see Login screen again */}
        <button onClick={onLogout} className="text-red-500 font-bold text-xs flex items-center gap-1 bg-red-50 px-3 py-2 rounded-lg">
            <LogOut size={14}/> Sign Out
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-full border-4 border-black overflow-hidden bg-white mb-4 shadow-lg">
            <img src={formData.avatar} alt="Current" className="w-full h-full object-cover" />
          </div>
          <p className="text-sm font-bold text-gray-500 mb-2">CHOOSE YOUR AVATAR</p>
          <div className="grid grid-cols-5 gap-3 w-full">
            {AVATAR_OPTIONS.map((url) => (
              <button key={url} onClick={() => setFormData({...formData, avatar: url})} className={`aspect-square rounded-full overflow-hidden border-2 transition-all ${formData.avatar === url ? 'border-blue-600 scale-110 ring-2 ring-blue-200' : 'border-transparent opacity-70'}`}>
                <img src={url} alt="avatar" className="w-full h-full" />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Display Name</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full p-3 bg-white border border-gray-200 rounded-xl font-medium focus:outline-none focus:border-black transition-colors" placeholder="e.g. Officer John"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unique User ID</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">@</span>
              <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value.toLowerCase().replace(/\s/g, '')})} className="w-full p-3 pl-8 bg-white border border-gray-200 rounded-xl font-medium focus:outline-none focus:border-black transition-colors" placeholder="username"/>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date of Birth</label>
            <input type="date" value={formData.dob} onChange={(e) => setFormData({...formData, dob: e.target.value})} className="w-full p-3 bg-white border border-gray-200 rounded-xl font-medium focus:outline-none focus:border-black transition-colors"/>
          </div>
        </div>
      </div>
      <div className="p-4 bg-white border-t border-gray-200">
        <button onClick={handleSave} disabled={isSaving} className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform">{isSaving ? "Saving..." : "Save Profile"}</button>
      </div>
    </div>
  );
};

// ==========================================
// 4. MAIN APP COMPONENT
// ==========================================

export default function App() {
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('map'); 
  
  const [reports, setReports] = useState([]);
  const [profile, setProfile] = useState({ points: 0, reportsCount: 0 });
  const [currentLoc, setCurrentLoc] = useState({ lat: 12.9716, lng: 77.5946 });
  const [source, setSource] = useState(null);
  const [dest, setDest] = useState(null);
  const [sourceQuery, setSourceQuery] = useState('Current Location');
  const [destQuery, setDestQuery] = useState('');
  const [routeInfo, setRouteInfo] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then(() => setLoading(false));
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

  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      setReports(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        lat: Number(doc.data().lat), 
        lng: Number(doc.data().lng)
      })));
    });
    return () => unsub();
  }, []);

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

  const swapLoc = () => {
    const tQ = sourceQuery; const tL = source;
    setSourceQuery(destQuery); setSource(dest);
    setDestQuery(tQ); setDest(tL);
  };

  const handleSubmitReport = async (type, file) => {
    if (!user || !currentLoc) return;
    setIsUploading(true);

    try {
      const data = new FormData();
      data.append("file", file);
      data.append("upload_preset", "mamamaps_preset"); 
      data.append("cloud_name", "dli9rzoef"); 

      const res = await fetch("https://api.cloudinary.com/v1_1/dli9rzoef/image/upload", { 
        method: "post",
        body: data
      });

      const json = await res.json();
      if (!json.secure_url) throw new Error("Image upload failed: " + (json.error?.message || "Unknown error"));

      await addDoc(collection(db, "reports"), {
        lat: currentLoc.lat,
        lng: currentLoc.lng,
        type: type,
        imageUrl: json.secure_url,
        createdAt: serverTimestamp(),
        reporterId: user.uid,
        verifiedCount: 0,
        status: 'active'
      });

      await awardPoints(10);
      setShowReportModal(false);
    } catch (e) {
      console.error("Error reporting:", e);
      alert("Upload failed. Check your connection.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleMarkerClick = (report) => {
    const dist = getDistanceFromLatLonInMeters(currentLoc.lat, currentLoc.lng, report.lat, report.lng);
    setSelectedReport({ ...report, distanceAway: Math.round(dist) });
  };

  const handleVerify = async (isValid) => {
    if (!selectedReport || !user) return;
    const reportRef = doc(db, "reports", selectedReport.id);
    await setDoc(reportRef, { verifiedCount: increment(isValid ? 1 : -1) }, { merge: true });
    await awardPoints(5); 
    setSelectedReport(null);
  };

  // HANDLERS FOR LOGIN COMPONENT
  const handleLogin = async ({ email, password }) => {
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (err) { alert(err.message); }
  };

  const handleSignUp = async ({ email, password }) => {
    try { await createUserWithEmailAndPassword(auth, email, password); } 
    catch (err) { alert(err.message); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentView('map');
  };

  // Render Logic
  if (loading || !authReady) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  
  if (!user) {
    // This connects to YOUR screens/Login.jsx now
    return <Login onSubmit={handleLogin} onSignUp={handleSignUp} onSocial={() => alert("Social Login soon")} />;
  }

  return (
    <div className="h-screen w-full flex flex-col bg-white relative font-sans">
      
      {currentView === 'profile' ? (
        <ProfileSettings 
          user={user} 
          profile={profile} 
          onClose={() => setCurrentView('map')}
          onSave={(updatedData) => setProfile(prev => ({...prev, ...updatedData}))}
          onLogout={handleLogout}
        />
      ) : (
        <>
          <div className="absolute top-0 left-0 right-0 p-4 z-20 flex flex-col gap-3 pointer-events-none">
            <div className="flex justify-between items-center pointer-events-auto">
              <div className="bg-white shadow-md px-4 py-2 rounded-full flex items-center gap-2 border border-gray-100">
                <Shield className="text-black fill-current" size={18} />
                <span className="text-black font-bold text-sm tracking-tight">MAMA MAPS</span>
              </div>
              <div className="flex gap-2 items-center">
                <button 
                  onClick={() => setCurrentView('profile')}
                  className="bg-black text-white pl-2 pr-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-md hover:scale-105 transition-transform"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-700 border-2 border-white overflow-hidden">
                     {profile.avatar ? (
                       <img src={profile.avatar} alt="me" className="w-full h-full object-cover" />
                     ) : (
                       <div className="w-full h-full flex items-center justify-center"><User size={14} /></div>
                     )}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="leading-none text-[11px]">{profile.username ? `@${profile.username}` : (user?.email?.split('@')[0] || "Officer")}</span>
                    <span className="text-[9px] text-yellow-300 leading-tight">
                      {getRankForPoints(profile.points || 0).name}
                    </span>
                  </div>
                </button>
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

          <div className="flex-1 relative z-0">
            <GoogleMapComponent
              center={currentLoc}
              source={source}
              dest={dest}
              reports={reports}
              onRouteInfo={setRouteInfo}
              onMarkerClick={handleMarkerClick}
            />

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

            <div className="absolute bottom-8 left-0 w-full flex justify-center z-20 pointer-events-none">
              <button
                onClick={() => setShowReportModal(true)}
                className="pointer-events-auto w-16 h-16 bg-yellow-400 rounded-full border-4 border-white shadow-2xl flex items-center justify-center hover:scale-105 transition-transform text-black"
              >
                <Camera size={28} strokeWidth={2.5} />
              </button>
            </div>

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
        </>
      )}
    </div>
  );
}