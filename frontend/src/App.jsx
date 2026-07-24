import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useSearchParams } from "react-router-dom";
import AdminApp from "./admin/AdminApp";
import logo from "../src/assets/susupal.png"; 
import whitelogo from "../src/assets/susupallogotwo.png";


const API_BASE = process.env.REACT_APP_API_URL || "/api";

function api(endpoint, options = {}) {
  const token = localStorage.getItem("susu_token");
  return fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  }).then((r) => r.json());
}

function LandingRedirect() {
  useEffect(() => {
    window.location.replace("/home.html");
  }, []);

  return null;
}

function PaymentVerificationPage() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference");
  const amount = searchParams.get("amount");
  const [status, setStatus] = useState("Checking payment status...");
  const [paymentState, setPaymentState] = useState({ confirmed: false, amount: amount ? Number(amount) : null, status: "Pending" });

  useEffect(() => {
    if (!reference) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const data = await api(`/payments/verify/${encodeURIComponent(reference)}`);
        if (cancelled) return;
        if (data?.status === "SUCCESS") {
          setPaymentState({ confirmed: true, amount: data.transaction?.amount ? Number(data.transaction.amount) : Number(amount || 0), status: "Completed" });
          setStatus("Payment successful. Your contribution and dashboard have been updated.");
          return;
        }
        setStatus("Payment is being confirmed by Korapay. Your dashboard will update automatically after the webhook arrives.");
      } catch (err) {
        if (!cancelled) {
          setStatus("Payment is being confirmed by Korapay. Your dashboard will update automatically after the webhook arrives.");
        }
      }
    };

    poll();
    const timer = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [amount, reference]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "#f8fafc" }}>
      <div style={{ maxWidth: "480px", width: "100%", background: "#fff", borderRadius: "16px", padding: "24px", boxShadow: "0 20px 45px rgba(15, 23, 42, 0.12)" }}>
        <h2 style={{ marginBottom: "8px", fontSize: "24px" }}>{paymentState.confirmed ? "Payment successful" : "Payment status update"}</h2>
        <p style={{ color: "#475569", marginBottom: "20px" }}>
          {status}
        </p>
        <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#f8fafc", color: "#0f172a", marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span>Amount</span>
            <strong>GHS {Number(paymentState.amount || 0).toFixed(2)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span>Reference</span>
            <strong>{reference || "—"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Status</span>
            <strong>{paymentState.status}</strong>
          </div>
        </div>
        <div style={{ marginTop: "16px" }}>
          <a href="/app" style={{ display: "inline-block", padding: "10px 14px", borderRadius: "999px", background: "#059669", color: "#fff", textDecoration: "none" }}>Back to dashboard</a>
        </div>
      </div>
    </div>
  );
}

// ─── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [step, setStep] = useState("name"); // name | phone | otp | pin
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useCallback((el) => { if (el && step === 'name') el.focus(); }, [step]);
  const phoneRef = useCallback((el) => { if (el && step === 'phone') el.focus(); }, [step]);
  const otpRef = useCallback((el) => { if (el && step === 'otp') el.focus(); }, [step]);
  const pinRef = useCallback((el) => { if (el && step === 'pin') el.focus(); }, [step]);

  async function sendOTPAsync() {
    setLoading(true);
    setError("");
    try {
      const res = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, phone }),
      });
      if (res.error) {
        if (res.error.includes("already registered")) {
          const loginRes = await api("/auth/login", {
            method: "POST",
            body: JSON.stringify({ phone }),
          });
          if (loginRes.error) throw new Error(loginRes.error);
        } else {
          throw new Error(res.error);
        }
      }
      setStep("otp");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const sendOTP = (e) => {
    e.preventDefault();
    sendOTPAsync();
  };

  const resendOTP = async () => {
    // Reuse registration flow which will fallback to login when appropriate
    await sendOTPAsync();
  };

  const verifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone, otp }),
      });
      if (res.error) throw new Error(res.error);
      localStorage.setItem("susu_token", res.token);
      if (res.requiresPin) {
        setStep("pin");
      } else {
        onLogin(res.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const setUserPin = async (e) => {
    e.preventDefault();
    if (pin !== confirmPin) return setError("PINs do not match");
    setLoading(true);
    setError("");
    try {
      const res = await api("/user/set-pin", {
        method: "POST",
        body: JSON.stringify({ pin, confirm_pin: confirmPin }),
      });
      if (res.error) throw new Error(res.error);
      const profileRes = await api("/user/profile");
      onLogin(profileRes.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon"><img width="240px" src={logo} alt="SusuPal logo" /></div>
          <p>Save daily. Earn monthly.</p>
        </div>

        <div className="step-indicator">
          <div className={`step ${step === 'name' ? 'active' : step === 'phone' || step === 'otp' || step === 'pin' ? 'complete' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Full Name</div>
          </div>
          <div className={`step ${step === 'phone' ? 'active' : step === 'otp' || step === 'pin' ? 'complete' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Phone Number</div>
          </div>
          <div className={`step ${step === 'otp' ? 'active' : step === 'pin' ? 'complete' : ''}`}>
            <div className="step-number">3</div>
            <div className="step-label">OTP Verification</div>
          </div>
          <div className={`step ${step === 'pin' ? 'active' : ''}`}>
            <div className="step-number">4</div>
            <div className="step-label">PIN</div>
          </div>
        </div>

        {step === "name" && (
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setError('Full name is required');
            setError('');
            setStep('phone');
          }} className="auth-form">
            <h2>Enter your full name</h2>
            <p className="form-hint">This will be used in your SusuPal messages.</p>
            <div className="input-group">
              <input
                ref={nameRef}
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              Continue →
            </button>
          </form>
        )}

        {step === "phone" && (
          <form onSubmit={sendOTP} className="auth-form">
            <h2>Enter your phone number</h2>
            <p className="form-hint">Use your Ghana phone number to receive OTP verification.</p>
            <div className="input-group">
              <span className="input-prefix">🇬🇭 +233</span>
              <input
                ref={phoneRef}
                type="tel"
                placeholder="244 123 456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                pattern="[0-9]{9,10}"
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
            <button type="button" className="btn-link" onClick={() => setStep('name')}>
              ← Back
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOTP} className="auth-form">
            <h2>Verify OTP</h2>
            <p className="form-hint">We sent a 6-digit code to {phone}</p>
            <input
              ref={otpRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0,6))}
              required
              maxLength={6}
              className="otp-input"
            />
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <div style={{ display: 'flex', gap: '8px', marginTop: 8 }}>
              <button
                type="button"
                className="btn-link"
                onClick={() => setStep("phone")}
              >
                ← Back
              </button>
              <button type="button" className="btn-secondary" onClick={resendOTP} disabled={loading}>
                Resend OTP
              </button>
            </div>
          </form>
        )}

        {step === "pin" && (
          <form onSubmit={setUserPin} className="auth-form">
            <h2>Set your PIN</h2>
            <p className="form-hint">
              Create a 4-digit PIN to secure transactions
            </p>
            <input
              ref={pinRef}
              type="password"
              placeholder="4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0,4))}
              maxLength={4}
              pattern="[0-9]{4}"
              required
              className="pin-input"
            />
            <input
              type="password"
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, '').slice(0,4))}
              maxLength={4}
              pattern="[0-9]{4}"
              required
              className="pin-input"
            />
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Setting PIN..." : "Set PIN & Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ user, onLogout }) {
  const [plan, setPlan] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("home"); // home | create | history | admin

  const loadData = useCallback(async () => {
    try {
      const [planRes, txRes] = await Promise.all([
        api("/savings/current"),
        api("/transactions?limit=5"),
      ]);
      const returnedPlans = planRes.plans || (planRes.plan ? [planRes.plan] : []);
      setPlans(returnedPlans);
      setPlan(returnedPlans[0] || null);
      setTransactions(txRes.transactions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading your susu...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="header-logo"><img width="140px" src={whitelogo} alt="SusuPal logo" /></span>
          {/* <span className="header-title">SusuPal</span> */}
        </div>
        <div className="header-right">
          <span className="header-phone">{user.phone?.slice(-9)}</span>
          <button className="btn-icon" onClick={onLogout} title="Logout">
            <svg
              width="20px"
              height="20px"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12.9999 2C10.2385 2 7.99991 4.23858 7.99991 7C7.99991 7.55228 8.44762 8 8.99991 8C9.55219 8 9.99991 7.55228 9.99991 7C9.99991 5.34315 11.3431 4 12.9999 4H16.9999C18.6568 4 19.9999 5.34315 19.9999 7V17C19.9999 18.6569 18.6568 20 16.9999 20H12.9999C11.3431 20 9.99991 18.6569 9.99991 17C9.99991 16.4477 9.55219 16 8.99991 16C8.44762 16 7.99991 16.4477 7.99991 17C7.99991 19.7614 10.2385 22 12.9999 22H16.9999C19.7613 22 21.9999 19.7614 21.9999 17V7C21.9999 4.23858 19.7613 2 16.9999 2H12.9999Z"
                fill="#ffff"
              />
              <path
                d="M13.9999 11C14.5522 11 14.9999 11.4477 14.9999 12C14.9999 12.5523 14.5522 13 13.9999 13V11Z"
                fill="#ffff"
              />
              <path
                d="M5.71783 11C5.80685 10.8902 5.89214 10.7837 5.97282 10.682C6.21831 10.3723 6.42615 10.1004 6.57291 9.90549C6.64636 9.80795 6.70468 9.72946 6.74495 9.67492L6.79152 9.61162L6.804 9.59454L6.80842 9.58848C6.80846 9.58842 6.80892 9.58778 5.99991 9L6.80842 9.58848C7.13304 9.14167 7.0345 8.51561 6.58769 8.19098C6.14091 7.86637 5.51558 7.9654 5.19094 8.41215L5.18812 8.41602L5.17788 8.43002L5.13612 8.48679C5.09918 8.53682 5.04456 8.61033 4.97516 8.7025C4.83623 8.88702 4.63874 9.14542 4.40567 9.43937C3.93443 10.0337 3.33759 10.7481 2.7928 11.2929L2.08569 12L2.7928 12.7071C3.33759 13.2519 3.93443 13.9663 4.40567 14.5606C4.63874 14.8546 4.83623 15.113 4.97516 15.2975C5.04456 15.3897 5.09918 15.4632 5.13612 15.5132L5.17788 15.57L5.18812 15.584L5.19045 15.5872C5.51509 16.0339 6.14091 16.1336 6.58769 15.809C7.0345 15.4844 7.13355 14.859 6.80892 14.4122L5.99991 15C6.80892 14.4122 6.80897 14.4123 6.80892 14.4122L6.804 14.4055L6.79152 14.3884L6.74495 14.3251C6.70468 14.2705 6.64636 14.1921 6.57291 14.0945C6.42615 13.8996 6.21831 13.6277 5.97282 13.318C5.89214 13.2163 5.80685 13.1098 5.71783 13H13.9999V11H5.71783Z"
                fill="#ffff"
              />
            </svg>
          </button>
        </div>
      </header>

      <main className="app-main">
        {view === "home" && (
          <HomeView
            plan={plan}
            plans={plans}
            transactions={transactions}
            user={user}
            onCreatePlan={() => setView("create")}
            onViewHistory={(planId) => { setSelectedPlanId(planId || null); setView("history"); }}
            onRefresh={loadData}
          />
        )}
        {view === "create" && (
          <CreatePlanView
            onBack={() => setView("home")}
            onCreated={() => {
              setView("home");
              loadData();
            }}
          />
        )}
        {view === "history" && <HistoryView onBack={() => setView("home")} planId={selectedPlanId} />}
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${view === "home" ? "active" : ""}`}
          onClick={() => setView("home")}
        >
          <span>
            <svg
              width="20px"
              height="20px"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 15L12 18"
                stroke="#1C274C"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <path
                d="M22 12.2039V13.725C22 17.6258 22 19.5763 20.8284 20.7881C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.7881C2 19.5763 2 17.6258 2 13.725V12.2039C2 9.91549 2 8.77128 2.5192 7.82274C3.0384 6.87421 3.98695 6.28551 5.88403 5.10813L7.88403 3.86687C9.88939 2.62229 10.8921 2 12 2C13.1079 2 14.1106 2.62229 16.116 3.86687L18.116 5.10812C20.0131 6.28551 20.9616 6.87421 21.4808 7.82274"
                stroke="#1C274C"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span>Home</span>
        </button>

        <button
          className={`nav-item ${view === "create" ? "active" : ""}`}
          onClick={() => setView("create")}
        >
          <span>
            <svg
              width="20px"
              height="20px"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15 12L12 12M12 12L9 12M12 12L12 9M12 12L12 15"
                stroke="#1C274C"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <path
                d="M7 3.33782C8.47087 2.48697 10.1786 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 10.1786 2.48697 8.47087 3.33782 7"
                stroke="#1C274C"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span>New Plan</span>
        </button>

        <button
          className={`nav-item ${view === "history" ? "active" : ""}`}
          onClick={() => setView("history")}
        >
          <span>
            <svg
              width="20px"
              height="20px"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 8V12L14.5 14.5"
                stroke="#1C274C"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M5.60423 5.60423L5.0739 5.0739V5.0739L5.60423 5.60423ZM4.33785 6.87061L3.58786 6.87438C3.58992 7.28564 3.92281 7.61853 4.33408 7.6206L4.33785 6.87061ZM6.87963 7.63339C7.29384 7.63547 7.63131 7.30138 7.63339 6.88717C7.63547 6.47296 7.30138 6.13549 6.88717 6.13341L6.87963 7.63339ZM5.07505 4.32129C5.07296 3.90708 4.7355 3.57298 4.32129 3.57506C3.90708 3.57715 3.57298 3.91462 3.57507 4.32882L5.07505 4.32129ZM3.75 12C3.75 11.5858 3.41421 11.25 3 11.25C2.58579 11.25 2.25 11.5858 2.25 12H3.75ZM16.8755 20.4452C17.2341 20.2378 17.3566 19.779 17.1492 19.4204C16.9418 19.0619 16.483 18.9393 16.1245 19.1468L16.8755 20.4452ZM19.1468 16.1245C18.9393 16.483 19.0619 16.9418 19.4204 17.1492C19.779 17.3566 20.2378 17.2341 20.4452 16.8755L19.1468 16.1245ZM5.14033 5.07126C4.84598 5.36269 4.84361 5.83756 5.13505 6.13191C5.42648 6.42626 5.90134 6.42862 6.19569 6.13719L5.14033 5.07126ZM18.8623 5.13786C15.0421 1.31766 8.86882 1.27898 5.0739 5.0739L6.13456 6.13456C9.33366 2.93545 14.5572 2.95404 17.8017 6.19852L18.8623 5.13786ZM5.0739 5.0739L3.80752 6.34028L4.86818 7.40094L6.13456 6.13456L5.0739 5.0739ZM4.33408 7.6206L6.87963 7.63339L6.88717 6.13341L4.34162 6.12062L4.33408 7.6206ZM5.08784 6.86684L5.07505 4.32129L3.57507 4.32882L3.58786 6.87438L5.08784 6.86684ZM12 3.75C16.5563 3.75 20.25 7.44365 20.25 12H21.75C21.75 6.61522 17.3848 2.25 12 2.25V3.75ZM12 20.25C7.44365 20.25 3.75 16.5563 3.75 12H2.25C2.25 17.3848 6.61522 21.75 12 21.75V20.25ZM16.1245 19.1468C14.9118 19.8483 13.5039 20.25 12 20.25V21.75C13.7747 21.75 15.4407 21.2752 16.8755 20.4452L16.1245 19.1468ZM20.25 12C20.25 13.5039 19.8483 14.9118 19.1468 16.1245L20.4452 16.8755C21.2752 15.4407 21.75 13.7747 21.75 12H20.25ZM6.19569 6.13719C7.68707 4.66059 9.73646 3.75 12 3.75V2.25C9.32542 2.25 6.90113 3.32791 5.14033 5.07126L6.19569 6.13719Z"
                fill="#1C274C"
              />
            </svg>
          </span>
          <span>History</span>
        </button>
      </nav>
    </div>
  );
}

// ─── Home View ─────────────────────────────────────────────────────────────────
function HomeView({ plan, plans = [], transactions, user, onCreatePlan, onViewHistory, onRefresh }) {
  const [charging, setCharging] = useState(false);

  const handleManualPay = async (planItem) => {
    if (!planItem) return;
    setCharging(true);
    try {
      const res = await api("/payments/create-checkout", {
        method: "POST",
        body: JSON.stringify({ plan_id: planItem.id, amount: planItem.daily_amount }),
      });
      if (res.error) {
        alert(res.error);
      } else if (res.checkout_url) {
        window.location.assign(res.checkout_url);
      } else {
        alert(res.message || "Unable to start checkout right now.");
      }
    } catch (err) {
      alert("Payment failed. Please try again.");
    } finally {
      setCharging(false);
    }
  };

  const displayPlans = (plans && plans.length > 0) ? plans : (plan ? [plan] : []);

  return (
    <div className="home-view">
      {/* Greeting */}
      <div className="greeting">
        <h2>Good Day! 👋</h2>
        <p>{user.name || user.phone}</p>
      </div>

      {/* Active Plan Cards */}
      {displayPlans && displayPlans.length > 0 ? (
        displayPlans.map((planItem, idx) => (
          <div key={planItem.id} className="plan-card">
            <div className="plan-header">
              <div>
                <p className="plan-label">{idx === 0 ? 'Active Susu Plan' : 'Additional Plan'}</p>
                <p className="plan-amount">
                  GHS {planItem.daily_amount}
                  <span>/day</span>
                </p>
                <p className="plan-name">{planItem.name || `Savings Plan #${idx + 1}`}</p>
              </div>
              <div className="plan-status">{planItem.status} ✓</div>
            </div>

            {/* Progress Ring */}
            <div className="progress-section">
              <ProgressRing pct={planItem.progress_percentage} />
              <div className="progress-stats">
                <div className="stat">
                  <span className="stat-val">{planItem.days_completed}</span>
                  <span className="stat-label">Days done</span>
                </div>
                <div className="stat">
                  <span className="stat-val">{planItem.days_remaining}</span>
                  <span className="stat-label">Days left</span>
                </div>
                <div className="stat">
                  <span className="stat-val">GHS {planItem.total_saved?.toFixed(2)}</span>
                  <span className="stat-label">Saved</span>
                </div>
              </div>
            </div>

            <div className="plan-footer">
              <div className="payout-info">
                <span>💸 Payout: GHS {planItem.projected_payout?.toFixed(2)}</span>
                <span>📅 {new Date(planItem.next_payout_date).toLocaleDateString('en-GH')}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-pay" onClick={() => handleManualPay(planItem)} disabled={charging}>
                  {charging ? 'Loading...' : 'Add Contribution 💳'}
                </button>
                <button className="btn-link" onClick={() => onViewHistory(planItem.id)}>View payments</button>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-plan-card">
          <div className="empty-icon">🏦</div>
          <h3>No active plan</h3>
          <p>Start saving daily and build your susu!</p>
          <button className="btn-primary" onClick={onCreatePlan}>
            Start Saving →
          </button>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="section">
        <div className="section-header">
          <h3>Recent Activity</h3>
          <button
            className="btn-link" onClick={() => onViewHistory(null)}
            > See all →
            </button>
         
        </div>
        {transactions.length === 0 ? (
          <p className="empty-text">No transactions yet</p>
        ) : (
          <div className="tx-list">
            {transactions.map((tx) => (
              <TxItem key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressRing({ pct }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width="110" height="110" className="progress-ring">
      <circle
        cx="55"
        cy="55"
        r={r}
        stroke="#e5e7eb"
        strokeWidth="8"
        fill="none"
      />
      <circle
        cx="55"
        cy="55"
        r={r}
        stroke="#16a34a"
        strokeWidth="8"
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 55 55)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x="55"
        y="52"
        textAnchor="middle"
        fontSize="16"
        fontWeight="600"
        fill="currentColor"
      >
        {pct}%
      </text>
      <text x="55" y="68" textAnchor="middle" fontSize="10" fill="#6b7280">
        complete
      </text>
    </svg>
  );
}

function TxItem({ tx, onConfirmPayment }) {
  const icons = { CONTRIBUTION: "💰", PAYOUT: "💸", COMMISSION: "🏛️", REFUND: "↩️" };
  const colors = { SUCCESS: "#16a34a", FAILED: "#dc2626", PENDING: "#d97706", REVERSED: "#6b7280" };

  const canConfirm =
    typeof onConfirmPayment === "function" &&
    tx.status === "PENDING" &&
    tx.type === "CONTRIBUTION";

  const planName = tx.plan?.name || tx.plan_name || tx.planName || "Savings Plan";
  const typeLabel = String(tx.type || "TRANSACTION").replace(/_/g, " ");

  return (
    <div className="tx-item">
      <span className="tx-icon">{icons[tx.type] || "💱"}</span>
      <div className="tx-info">
        <div className="tx-meta-row">
          <span className="tx-type">{typeLabel}</span>
          {planName && <span className="tx-plan-badge">{planName}</span>}
        </div>
        <span className="tx-date">
          {new Date(tx.created_at).toLocaleDateString("en-GH")}
        </span>
        <span className="tx-reference">{tx.reference}</span>
        {canConfirm && (
          <button
            type="button"
            className="btn-confirm-payment"
            onClick={() => onConfirmPayment(tx)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            </svg>
            Confirm Payment
          </button>
        )}
      </div>
      <div className="tx-right">
        <span className="tx-amount">GHS {Number(tx.amount ?? tx.net_amount ?? 0).toFixed(2)}</span>
        <span className="tx-status" style={{ color: colors[tx.status] || colors.SUCCESS }}>
          {tx.status}
        </span>
      </div>
    </div>
  );
}

// ─── Confirm Payment Modal ─────────────────────────────────────────────────────
function ConfirmPaymentModal({ tx, onClose, onSubmitted }) {
  const [korapayRef, setKorapayRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!tx) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = korapayRef.trim();
    if (!trimmed) {
      setError("Please enter your Korapay reference.");
      return;
    }
    if (trimmed.length < 6) {
      setError("That Korapay reference looks too short. Please double-check it.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await api("/payments/request-confirmation", {
        method: "POST",
        body: JSON.stringify({
          transaction_reference: tx.reference,
          korapay_reference: trimmed,
        }),
      });
      if (res.error) throw new Error(res.error);
      setSuccess(
        res.message ||
          "Confirmation request submitted. Our team will verify your payment shortly."
      );
      if (typeof onSubmitted === "function") onSubmitted();
    } catch (err) {
      setError(err.message || "Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Confirm payment">
        <div className="modal-header">
          <h3>Confirm Payment</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {success ? (
          <div className="modal-body">
            <div className="modal-success">
              <div className="modal-success-icon">✅</div>
              <p>{success}</p>
            </div>
            <button type="button" className="btn-primary btn-full" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="modal-body" onSubmit={handleSubmit}>
            <p className="modal-hint">
              Paid on Korapay but your transaction is still pending? Enter the
              Korapay reference from your payment receipt and our team will
              verify it.
            </p>

            <div className="modal-summary">
              <div className="modal-summary-row">
                <span>Amount</span>
                <strong>GHS {Number(tx.amount).toFixed(2)}</strong>
              </div>
              <div className="modal-summary-row">
                <span>Date</span>
                <strong>{new Date(tx.created_at).toLocaleString("en-GH")}</strong>
              </div>
              <div className="modal-summary-row">
                <span>Status</span>
                <strong style={{ color: "#d97706" }}>{tx.status}</strong>
              </div>
            </div>

            <div className="modal-field">
              <label htmlFor="susu-ref">SusuPal Reference</label>
              <input
                id="susu-ref"
                type="text"
                value={tx.reference}
                readOnly
                className="modal-input modal-input-readonly"
              />
            </div>

            <div className="modal-field">
              <label htmlFor="korapay-ref">Korapay Reference</label>
              <input
                id="korapay-ref"
                type="text"
                placeholder="e.g. KPY-PAY-Lgf4RTCBcbzG"
                value={korapayRef}
                onChange={(e) => { setKorapayRef(e.target.value); setError(""); }}
                className="modal-input"
                autoFocus
                autoComplete="off"
                spellCheck="false"
              />
              <span className="modal-field-hint">
                Found in your Korapay payment receipt or SMS Transaction.
              </span>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Create Plan View ──────────────────────────────────────────────────────────
function CreatePlanView({ onBack, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    daily_amount: "10",
    duration: "31",
    payout_method: "MTN",
    payout_account: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const presets = [10, 20, 50, 100];

  const commission = parseInt(process.env.REACT_APP_COMMISSION_DAYS || "1");
  const projectedTotal = Number(form.daily_amount) * Number(form.duration);
  const projectedPayout =
    Number(form.daily_amount) * (Number(form.duration) - commission);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api("/savings/create-plan", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          daily_amount: Number(form.daily_amount),
          duration: Number(form.duration),
          payout_method: form.payout_method,
          payout_account: form.payout_account || undefined,
        }),
      });
      if (res.error) throw new Error(res.error);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-view">
      <div className="view-header">
        <button className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <h2>New Savings Plan</h2>
      </div>

      <form onSubmit={handleSubmit} className="create-form">
        <div className="form-section">
          <div className="form-label-row">
            <label htmlFor="plan-name">Plan name</label>
            <span className="form-label-meta">Required</span>
          </div>
          <input
            id="plan-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. My House Savings"
            required
          />
          <p className="form-field-hint">
            Give your plan a clear name so it is easy to recognize in your history.
          </p>
        </div>

        {/* Daily Amount */}
        <div className="form-section">
          <div className="form-label-row">
            <label htmlFor="daily-amount">Daily contribution (GHS)</label>
            <span className="form-label-meta">Min. GHS 10</span>
          </div>
          <div className="preset-grid">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className={`preset-btn ${
                  form.daily_amount === String(p) ? "active" : ""
                }`}
                onClick={() => setForm({ ...form, daily_amount: String(p) })}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            id="daily-amount"
            type="number"
            value={form.daily_amount}
            onChange={(e) => setForm({ ...form, daily_amount: e.target.value })}
            min="10"
            max="10000"
            step="1"
            className="amount-input"
            placeholder="Minimum contribution is GHS 10"
          />
          <p className="form-field-hint">
            The minimum contribution amount is GHS 10.
          </p>
        </div>

        {/* Duration */}
        <div className="form-section">
          <label>
            Duration: <strong>{form.duration} days</strong>
          </label>
          <input
            type="range"
            min="7"
            max="93"
            value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value })}
            className="range-input"
          />
          <div className="range-labels">
            <span>7 days</span>
            <span>93 days</span>
          </div>
        </div>

        {/* Payout Summary */}
        <div className="payout-summary">
          <div className="summary-row">
            <span>Total contributions</span>
            <span>GHS {projectedTotal.toFixed(2)}</span>
          </div>
          <div className="summary-row muted">
            <span>Platform fee ({commission} day)</span>
            <span>
              GHS {(Number(form.daily_amount) * commission).toFixed(2)}
            </span>
          </div>
          <div className="summary-row highlight">
            <span>💰 You receive</span>
            <strong>GHS {projectedPayout.toFixed(2)}</strong>
          </div>
        </div>

        {/* Payout Network */}
        <div className="form-section">
          <label>Mobile money network</label>
          <div className="network-grid">
            {["MTN", "TELECEL", "AIRTELTIGO"].map((n) => (
              <button
                key={n}
                type="button"
                className={`network-btn ${
                  form.payout_method === n ? "active" : ""
                }`}
                onClick={() => setForm({ ...form, payout_method: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="form-section">
          <label>Payout account (optional)</label>
          <input
            type="tel"
            value={form.payout_account}
            onChange={(e) =>
              setForm({ ...form, payout_account: e.target.value })
            }
            placeholder="e.g. 0244123456 (leave blank to use your number)"
          />
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button
          type="submit"
          className="btn-primary btn-full"
          disabled={loading}
        >
          {loading ? "Creating plan..." : "Start Saving 🚀"}
        </button>
      </form>
    </div>
  );
}

// ─── History View ──────────────────────────────────────────────────────────────
function HistoryView({ onBack, planId }) {
  const [transactions, setTransactions] = useState([]);
  const [planDetail, setPlanDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [confirmTx, setConfirmTx] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const pct = planDetail
    ? Math.round((Number(planDetail.days_completed || 0) / Math.max(1, Number(planDetail.duration || 1))) * 100)
    : 0;
  const totalContrib = planDetail
    ? Number(planDetail.daily_amount || 0) * Number(planDetail.duration || 0)
    : 0;
  const saved = planDetail
    ? Number(planDetail.total_saved ?? (Number(planDetail.days_completed || 0) * Number(planDetail.daily_amount || 0)))
    : 0;
  const remaining = Math.max(0, totalContrib - saved);

  useEffect(() => {
    setLoading(true);
    const fetch = async () => {
      try {
        if (planId) {
            const res = await api(`/savings/${planId}/transactions`);
            // Normalize transactions to an array regardless of response shape
            let txs = [];
            if (Array.isArray(res)) txs = res;
            else if (res && Array.isArray(res.transactions)) txs = res.transactions;
            else if (res && Array.isArray(res.data)) txs = res.data;
            else if (res && res.transactions && Array.isArray(res.transactions.data)) txs = res.transactions.data;
            else {
              console.warn('Unexpected /savings/:id/transactions response shape', res);
              txs = [];
            }
            setTransactions(txs);
          // Fetch plan list and find details for the selected plan
          const history = await api('/savings/history');
          const found = (history.plans || []).find(p => p.id === planId);
          setPlanDetail(found || null);
          setPagination(null);
        } else {
          const res = await api(`/transactions?page=${page}&limit=20`);
          let txs = [];
          if (Array.isArray(res)) txs = res;
          else if (res && Array.isArray(res.transactions)) txs = res.transactions;
          else if (res && Array.isArray(res.data)) txs = res.data;
          else {
            console.warn('Unexpected /transactions response shape', res);
            txs = [];
          }
          setTransactions(txs);
          setPagination(res.pagination || null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [planId, page, refreshKey]);

  return (
    <div className="history-view">
      <div className="view-header">
        <button className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <h2>Transaction History</h2>
      </div>
      {planId && planDetail && (
        <div className="plan-detail-card">
          <div className="plan-detail-main">
            <div>
              <div className="plan-detail-title">
                {planDetail.name || 'Savings Plan'}
              </div>
              <div className="plan-badge">{planDetail.status}</div>
            </div>
          </div>

          <div className="plan-progress-row">
            <div className="plan-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="progress-percent">{pct}%</div>
            </div>
            <div className="plan-stats">
              <div className="stat">
                <div className="stat-val">GHS {saved.toFixed(2)}</div>
                <div className="stat-label">Saved</div>
              </div>
              <div className="stat">
                <div className="stat-val">GHS {remaining.toFixed(2)}</div>
                <div className="stat-label">Remaining</div>
              </div>
              <div className="stat">
                <div className="stat-val">{planDetail.days_completed}/{planDetail.duration}</div>
                <div className="stat-label">Days</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <div className="loading-inline">Loading...</div>
      ) : (
        <>
          <div className="tx-list">
            {transactions.map((tx) => (
              <TxItem key={tx.id} tx={tx} onConfirmPayment={setConfirmTx} />
            ))}
          </div>
          {pagination && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                ← Prev
              </button>
              <span>
                {page} / {pagination.pages}
              </span>
              <button
                disabled={page >= pagination.pages}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
      {confirmTx && (
        <ConfirmPaymentModal
          tx={confirmTx}
          onClose={() => setConfirmTx(null)}
          onSubmitted={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

// ─── User App Root ─────────────────────────────────────────────────────────────
function UserApp() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("susu_token");
    if (token) {
      api("/user/profile")
        .then((res) => {
          if (res.user) setUser(res.user);
          else localStorage.removeItem("susu_token");
        })
        .catch(() => localStorage.removeItem("susu_token"))
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogin = (userData) => setUser(userData);
  const handleLogout = () => {
    localStorage.removeItem("susu_token");
    setUser(null);
  };

  if (checking) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }

        /* Auth */
        .auth-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%); padding: 1rem; }
        .auth-card { background: #fff; border-radius: 20px; padding: 2rem; width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
        .auth-logo { text-align: center; margin-bottom: 2rem; }
        .logo-icon { font-size: 48px; display: block; margin-bottom: 0.5rem; }
        .auth-logo h1 { font-size: 28px; font-weight: 700; color: #064e3b; }
        .auth-logo p { color: #6b7280; font-size: 14px; margin-top: -30px; display:none; }
        .auth-form h2 { font-size: 20px; font-weight: 600; margin-bottom: 0.25rem; }
        .form-hint { color: #6b7280; font-size: 13px; margin-bottom: 1.25rem; }
        .input-group { display: flex; border: 1.5px solid #d1fae5; border-radius: 10px; overflow: hidden; margin-bottom: 1rem; }
        .input-prefix { background: #ecfdf5; padding: 0.75rem; font-size: 14px; color: #065f46; border-right: 1.5px solid #d1fae5; white-space: nowrap; }
        .input-group input { flex: 1; border: none; outline: none; padding: 0.75rem; font-size: 16px; }
        .auth-form input:not(.input-group input) { width: 100%; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 0.75rem; font-size: 16px; outline: none; margin-bottom: 1rem; }
        .auth-form input:focus { border-color: #059669; }
        .otp-input { text-align: center; font-size: 24px !important; letter-spacing: 8px; }
        .pin-input { text-align: center; font-size: 24px !important; letter-spacing: 12px; }
        .error-msg { background: #fef2f2; color: #dc2626; padding: 0.75rem; border-radius: 8px; font-size: 13px; margin-bottom: 1rem; }

        /* Buttons */
        .btn-primary { width: 100%; background: #059669; color: #fff; border: none; border-radius: 10px; padding: 0.875rem; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .btn-primary:hover { background: #047857; }
        .btn-primary:disabled { background: #9ca3af; cursor: not-allowed; }
        .btn-link { background: none; border: none; color: #ffff; cursor: pointer; font-size: 14px; padding: 0.5rem 0; display: block; text-align: center; margin-top: 0.5rem; }
        .btn-link :hover {color: #047857; }
        .btn-back { background: none; border: none; color: #059669; cursor: pointer; font-size: 14px; font-weight: 500; }
        .btn-icon { background: none; border: none; cursor: pointer; font-size: 20px; }
        .btn-full { margin-top: 1rem; }
        .btn-pay { background: #059669; color: #fff; border: none; border-radius: 8px; padding: 0.625rem 1.25rem; font-size: 14px; font-weight: 600; cursor: pointer; }
        .btn-pay:disabled { background: #9ca3af; }

        /* App Shell */
        .app { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #fff; position: relative; padding-bottom: 70px; }
        .app-header { position: sticky; top: 0; background: #064e3b; color: #fff; padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; z-index: 10; }
        .header-left { display: flex; align-items: center; gap: 8px; }
        .header-logo { font-size: 20px; }
        .header-title { font-size: 18px; font-weight: 700; }
        .header-right { display: flex; align-items: center; gap: 8px; }
        .header-phone { font-size: 12px; opacity: 0.8; }
        .app-main { padding: 1rem; }
        .bottom-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; background: #fff; border-top: 1px solid #e5e7eb; display: flex; }
        .nav-item { flex: 1; background: none; border: none; padding: 0.75rem 0; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10px; color: #9ca3af; cursor: pointer; }
        .nav-item span:first-child { font-size: 20px; }
        .nav-item.active { color: #059669; }

        /* Home View */
        .home-view { padding-bottom: 1rem; }
        .greeting { margin-bottom: 1rem; }
        .greeting h2 { font-size: 22px; font-weight: 700; }
        .greeting p { color: #6b7280; font-size: 14px; }
        .plan-card { background: linear-gradient(135deg, #064e3b, #059669); border-radius: 16px; padding: 1.25rem; color: #fff; margin-bottom: 1.25rem; }
        .plan-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
        .plan-label { font-size: 12px; opacity: 0.8; }
        .plan-amount { font-size: 28px; font-weight: 700; }
        .plan-amount span { font-size: 14px; opacity: 0.8; }
        .plan-status { background: rgba(255,255,255,0.2); border-radius: 20px; padding: 4px 12px; font-size: 12px; }
        .progress-section { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
        .progress-ring { flex-shrink: 0; }
        .progress-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; flex: 1; }
        .stat { background: rgba(255,255,255,0.15); border-radius: 8px; padding: 0.5rem; }
        .stat-val { display: block; font-size: 16px; font-weight: 700; }
        .stat-label { font-size: 10px; opacity: 0.8; }
        .plan-footer { border-top: 1px solid rgba(255,255,255,0.2); padding-top: 1rem; display: flex; justify-content: space-between; align-items: center; }
        .payout-info { display: flex; flex-direction: column; gap: 2px; font-size: 12px; opacity: 0.9; }
        .empty-plan-card { background: #f0fdf4; border: 2px dashed #86efac; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.25rem; }
        .empty-icon { font-size: 48px; margin-bottom: 0.5rem; }
        .empty-plan-card h3 { margin-bottom: 0.25rem; }
        .empty-plan-card p { color: #6b7280; font-size: 14px; margin-bottom: 1rem; }
        .empty-plan-card .btn-primary { width: auto; padding: 0.75rem 2rem; }

        /* Section */
        .section { margin-top: 1rem; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
        .section-header h3 { font-size: 16px; font-weight: 600; }
        .empty-text { color: #9ca3af; font-size: 14px; text-align: center; padding: 1rem; }

        /* Transaction Items */
        .tx-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .tx-item { display: flex; align-items: center; gap: 0.75rem; background: #f9fafb; border-radius: 10px; padding: 0.75rem; }
        .tx-icon { font-size: 20px; flex-shrink: 0; }
        .tx-info { flex: 1; min-width: 0; }
        .tx-type { display: block; font-size: 14px; font-weight: 500; }
        .tx-date { font-size: 12px; color: #9ca3af; }
        .tx-right { text-align: right; }
        .tx-amount { display: block; font-size: 14px; font-weight: 600; }
        .tx-status { font-size: 11px; }
        .btn-confirm-payment { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; background: #ecfdf5; color: #047857; border: 1.5px solid #a7f3d0; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s, border-color 0.15s, transform 0.1s; }
        .btn-confirm-payment:hover { background: #d1fae5; border-color: #6ee7b7; }
        .btn-confirm-payment:active { transform: scale(0.97); }

        /* Confirm Payment Modal */
        .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 100; animation: fadeIn 0.15s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .modal-card { background: #fff; border-radius: 18px; width: 100%; max-width: 420px; max-height: calc(100vh - 32px); overflow-y: auto; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25); animation: slideUp 0.2s ease; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid #f1f5f9; position: sticky; top: 0; background: #fff; border-radius: 18px 18px 0 0; }
        .modal-header h3 { font-size: 17px; font-weight: 700; color: #064e3b; }
        .modal-close { background: #f1f5f9; border: none; width: 30px; height: 30px; border-radius: 999px; cursor: pointer; color: #64748b; font-size: 13px; line-height: 1; transition: background 0.15s; }
        .modal-close:hover { background: #e2e8f0; }
        .modal-body { padding: 1.25rem; }
        .modal-hint { font-size: 13px; color: #6b7280; line-height: 1.5; margin-bottom: 1rem; }
        .modal-summary { background: #f0fdf4; border: 1px solid #d1fae5; border-radius: 12px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
        .modal-summary-row { display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0; font-size: 13px; color: #374151; }
        .modal-summary-row strong { font-size: 13px; color: #064e3b; }
        .modal-field { margin-bottom: 1rem; }
        .modal-field label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 0.35rem; }
        .modal-input { width: 100%; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 0.7rem 0.85rem; font-size: 14px; outline: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; transition: border-color 0.15s; }
        .modal-input:focus { border-color: #059669; }
        .modal-input-readonly { background: #f8fafc; color: #64748b; cursor: default; }
        .modal-field-hint { display: block; font-size: 11px; color: #9ca3af; margin-top: 0.3rem; }
        .modal-actions { display: flex; gap: 10px; margin-top: 1.25rem; }
        .modal-actions .btn-primary { flex: 1; width: auto; padding: 0.75rem; }
        .btn-secondary { flex: 1; background: #fff; color: #374151; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 0.75rem; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
        .btn-secondary:hover { background: #f9fafb; }
        .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        .modal-success { text-align: center; padding: 1rem 0 1.5rem; }
        .modal-success-icon { font-size: 42px; margin-bottom: 0.75rem; }
        .modal-success p { color: #374151; font-size: 14px; line-height: 1.5; }
        @media (max-width: 480px) {
          .modal-overlay { padding: 0; align-items: flex-end; }
          .modal-card { max-width: 100%; border-radius: 18px 18px 0 0; max-height: 92vh; }
          .modal-header { border-radius: 18px 18px 0 0; }
        }

        /* Create Plan */
        .create-view { padding-bottom: 2rem; }
        .view-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; }
        .view-header h2 { font-size: 18px; font-weight: 600; }
        .create-form .form-section { margin-bottom: 1.25rem; }
        .create-form .form-label-row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
        .create-form label { display: block; font-size: 13px; font-weight: 500; color: #374151; }
        .create-form .form-label-meta { font-size: 11px; font-weight: 600; color: #059669; }
        .create-form .form-field-hint { margin-top: 0.4rem; font-size: 11px; color: #6b7280; line-height: 1.45; }
        .preset-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 0.75rem; }
        .preset-btn { background: #f0fdf4; border: 1.5px solid #d1fae5; border-radius: 8px; padding: 0.5rem; font-size: 14px; font-weight: 600; cursor: pointer; color: #065f46; }
        .preset-btn.active { background: #059669; color: #fff; border-color: #059669; }
        .amount-input, .create-form input[type="tel"] { width: 100%; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 0.75rem; font-size: 16px; outline: none; }
        .amount-input:focus, .create-form input[type="tel"]:focus { border-color: #059669; }
        .range-input { width: 100%; accent-color: #059669; margin-bottom: 0.25rem; }
        .range-labels { display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
        .payout-summary { background: #f0fdf4; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; }
        .summary-row { display: flex; justify-content: space-between; padding: 0.375rem 0; font-size: 14px; }
        .summary-row.muted { color: #6b7280; }
        .summary-row.highlight { border-top: 1px solid #d1fae5; margin-top: 0.25rem; padding-top: 0.625rem; font-weight: 600; color: #064e3b; }
        .network-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .network-btn { background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 0.625rem; font-size: 13px; font-weight: 600; cursor: pointer; }
        .network-btn.active { background: #059669; color: #fff; border-color: #059669; }

        /* History */
        .history-view { padding-bottom: 2rem; }
        .loading-inline { text-align: center; padding: 2rem; color: #6b7280; }
        .pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem; }
        .pagination button { background: #f0fdf4; border: 1px solid #d1fae5; border-radius: 8px; padding: 0.5rem 1rem; color: #059669; cursor: pointer; font-weight: 500; }
        .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
        .pagination span { font-size: 14px; color: #6b7280; }

        /* Plan Detail Card */
        .plan-detail-card { background: #f8fffb; border: 1px solid #dff6ea; border-radius: 12px; padding: 12px; margin: 12px 0; }
        .plan-detail-main { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:10px; }
        .plan-detail-title { font-size:14px; font-weight:700; }
        .plan-detail-sub { color:#065f46; font-size:13px; }
        .plan-badge { background:#e6ffef; color:#065f46; padding:6px 10px; border-radius:999px; font-size:12px; font-weight:600; }
        .plan-progress-row { display:flex; gap:12px; align-items:center; }
        .plan-progress { display:flex; align-items:center; gap:10px; min-width:160px; }
        .progress-bar { width:120px; height:12px; background:#e6f6ef; border-radius:999px; overflow:hidden; }
        .progress-fill { height:100%; background:linear-gradient(90deg,#10b981,#059669); border-radius:999px 0 0 999px; transition: width 0.6s ease; }
        .progress-percent { font-weight:700; color:#065f46; font-size:13px; }
        .plan-stats { display:flex; gap:12px; flex:1; justify-content:flex-end; }
        .plan-stats .stat { text-align:right; }
        .plan-stats .stat-val { font-weight:700; color:#064e3b; }
        .plan-stats .stat-label { font-size:12px; color:#6b7280; }

        /* Loading */
        .loading-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 1rem; }
        .spinner { width: 36px; height: 36px; border: 3px solid #d1fae5; border-top-color: #059669; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {user ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <AuthScreen onLogin={handleLogin} />
      )}
    </div>
  );
}

// ─── App Root with routing ─────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRedirect />} />
      <Route path="/app/*" element={<UserApp />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/payment/verify" element={<PaymentVerificationPage />} />
    </Routes>
  );
}
