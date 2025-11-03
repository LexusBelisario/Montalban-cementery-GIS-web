import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";
import WarningModal from "../components/modals/WarningModal";

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [accessModal, setAccessModal] = useState({
    isVisible: false,
    title: "",
    message: "",
    severity: "warning",
    canProceed: false,
  });

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const resp = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await resp.json();
      console.log("Login response:", data);

      if (!resp.ok) {
        if (resp.status === 403) {
          setAccessModal({
            isVisible: true,
            title: "Access Denied",
            message:
              data?.detail ||
              "You do not have access yet. Please contact administrator.",
            severity: "error",
            canProceed: false,
          });
        } else {
          alert(`Login failed: ${data?.detail || "Invalid credentials"}`);
        }
        return;
      }

      const token = data?.access_token;
      localStorage.setItem("accessToken", token);

      if (data?.user_type === "admin") {
        navigate("/admin");
      } else {
        navigate("/map");
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleModalClose = () => {
    setAccessModal({
      isVisible: false,
      title: "",
      message: "",
      severity: "warning",
      canProceed: false,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1b1464] via-[#2a1d7a] to-[#1b1464] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle Background Elements */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 w-full h-full">
          <svg
            className="absolute bottom-0 left-10 w-32 h-48 text-[#f8f8fa]"
            viewBox="0 0 100 150"
            fill="currentColor"
          >
            <path d="M50 10 L30 50 L35 50 L20 80 L30 80 L15 110 L40 110 L40 145 L60 145 L60 110 L85 110 L70 80 L80 80 L65 50 L70 50 Z" />
          </svg>
          <svg
            className="absolute top-20 right-20 w-40 h-56 text-[#f8f8fa]"
            viewBox="0 0 100 150"
            fill="currentColor"
          >
            <path d="M50 5 L25 60 L32 60 L15 95 L28 95 L10 130 L45 130 L45 148 L55 148 L55 130 L90 130 L72 95 L85 95 L68 60 L75 60 Z" />
          </svg>
        </div>
      </div>

      {/* Floating decorative circles */}
      <div className="absolute top-20 right-1/4 w-64 h-64 bg-[#5a5778] rounded-full blur-3xl opacity-20"></div>
      <div className="absolute bottom-32 left-1/4 w-48 h-48 bg-[#808080] rounded-full blur-3xl opacity-10"></div>

      {/* Main Login Container */}
      <div className="relative z-10 w-full max-w-6xl flex items-center justify-center gap-12">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex flex-col items-start text-[#f8f8fa] space-y-8 flex-1">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <img
              src="/icons/main_logo.png"
              alt="Forest Lawn Memorial Park Logo"
              className="w-24 h-24 object-contain drop-shadow-2xl"
            />
          </div>

          {/* Title */}
          <div className="space-y-3">
            <h1
              className="text-5xl font-bold tracking-tight leading-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Forest Lawn
              <br />
              Memorial Park
            </h1>
            <div className="h-1 w-32 bg-gradient-to-r from-[#5a5778] to-transparent rounded-full"></div>
            <p className="text-2xl text-[#ceced2] font-light">Montalban</p>
          </div>

          {/* Description */}
          <div className="space-y-3">
            <p className="text-lg text-[#ceced2]">
              Geographic Information System
            </p>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-[480px]">
          <div className="bg-[#f8f8fa] rounded-3xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-br from-[#1b1464] to-[#5a5778] px-8 py-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#f8f8fa] opacity-5 rounded-full -mr-20 -mt-20"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#f8f8fa] opacity-5 rounded-full -ml-16 -mb-16"></div>

              <div className="relative z-10 text-center">
                <img
                  src="/icons/main_logo.png"
                  alt="Logo"
                  className="w-16 h-16 object-contain mx-auto mb-4 drop-shadow-lg lg:hidden"
                />
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-8 py-10 space-y-6">
              {/* Username Field */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[#1b1464]">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg
                      className={`w-5 h-5 transition-colors duration-200 ${
                        usernameFocused || username
                          ? "text-[#1b1464]"
                          : "text-[#808080]"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setUsernameFocused(true)}
                    onBlur={() => setUsernameFocused(false)}
                    className={`w-full pl-12 pr-4 py-3.5 bg-white border-2 rounded-xl text-[#1b1464] placeholder-[#808080] focus:outline-none transition-all duration-300 ${
                      usernameFocused || username
                        ? "border-[#1b1464] shadow-lg shadow-[#1b1464]/20"
                        : "border-[#ceced2] hover:border-[#5a5778]"
                    }`}
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[#1b1464]">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg
                      className={`w-5 h-5 transition-colors duration-200 ${
                        passwordFocused || password
                          ? "text-[#1b1464]"
                          : "text-[#808080]"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    className={`w-full pl-12 pr-12 py-3.5 bg-white border-2 rounded-xl text-[#1b1464] placeholder-[#808080] focus:outline-none transition-all duration-300 ${
                      passwordFocused || password
                        ? "border-[#1b1464] shadow-lg shadow-[#1b1464]/20"
                        : "border-[#ceced2] hover:border-[#5a5778]"
                    }`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#808080] hover:text-[#1b1464] transition-colors duration-200"
                  >
                    {showPassword ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[#ceced2] text-[#1b1464] focus:ring-[#1b1464] focus:ring-offset-0 focus:ring-2"
                  />
                  <span className="ml-2 text-sm text-[#808080] group-hover:text-[#1b1464] transition-colors">
                    Remember me
                  </span>
                </label>
                <a
                  href="#"
                  className="text-sm text-[#5a5778] hover:text-[#1b1464] font-medium transition-colors duration-200"
                >
                  Forgot password?
                </a>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full bg-gradient-to-r from-[#1b1464] to-[#5a5778] hover:from-[#5a5778] hover:to-[#1b1464] text-[#f8f8fa] font-bold py-4 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl mt-8 ${
                  isLoading ? "opacity-70 cursor-not-allowed" : ""
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>

              {/* Register Link */}
              <div className="text-center pt-6 border-t border-[#ceced2]/50">
                <span className="text-sm text-[#808080]">
                  Don't have an account?{" "}
                </span>
                <a
                  href="/register"
                  className="text-sm text-[#1b1464] hover:text-[#5a5778] font-semibold transition-colors duration-200"
                >
                  Request Access
                </a>
              </div>
            </form>

            {/* Footer Accent */}
            <div className="h-2 bg-gradient-to-r from-[#1b1464] via-[#5a5778] to-[#808080]"></div>
          </div>

          {/* Mobile Branding */}
          <div className="lg:hidden text-center mt-8">
            <h3 className="text-[#f8f8fa] text-xl font-bold">
              Forest Lawn Memorial Park - Montalban
            </h3>
            <p className="text-[#ceced2] text-sm mt-2">
              Geographic Information System
            </p>
          </div>
        </div>
      </div>

      {accessModal.isVisible && (
        <WarningModal
          isVisible={accessModal.isVisible}
          onClose={handleModalClose}
          title={accessModal.title}
          message={accessModal.message}
          severity={accessModal.severity}
          buttonText="Ok"
        />
      )}
    </div>
  );
}

export default LoginPage;
