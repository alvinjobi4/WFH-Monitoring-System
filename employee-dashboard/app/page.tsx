"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if already logged in
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role === "admin") {
      router.push("/admin");
    } else if (role === "employee") {
      router.push("/employee");
    } else {
      setIsCheckingAuth(false);
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const trimmedEmpId = empId.trim();
    const trimmedPassword = password.trim();

    try {
      let targetUsername = "";
      let targetPassword = "";
      let targetRole = "employee";

      // Lookup user in employees table by id (Employee ID or username)
      const { data: empData } = await supabase
        .from("employees")
        .select("*")
        .eq("id", trimmedEmpId)
        .single();

      let finalEmpData = empData;

      if (!finalEmpData) {
        // Fallback: check by name/username
        const { data: empDataByName } = await supabase
          .from("employees")
          .select("*")
          .eq("name", trimmedEmpId)
          .single();
        finalEmpData = empDataByName;
      }

      if (!finalEmpData) {
        setError("Invalid Employee ID or password");
        setIsLoading(false);
        return;
      }

      targetUsername = finalEmpData.name;
      targetPassword = finalEmpData.password || "12345";
      targetRole = finalEmpData.role || "employee";

      // Check password (if not set in DB, fallback to "12345")
      if (trimmedPassword !== targetPassword) {
        setError("Invalid Employee ID or password");
        setIsLoading(false);
        return;
      }

      // Successful login
      localStorage.setItem("userRole", targetRole);
      localStorage.setItem("userName", targetUsername);

      if (targetRole === "admin") {
        router.push("/admin");
      } else {
        router.push("/employee");
      }
    } catch (err) {
      setError("An error occurred during login.");
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) return null;

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background flat canvas */}
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="relative max-w-sm w-full mx-auto">
        <div className="relative bg-[#121826] border border-slate-800 rounded-[14px] shadow-sm p-6 md:p-8">

          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">
              WFH Monitor
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wide">
              Sign in to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/10 text-rose-400 text-xs text-center font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-0.5">Employee ID</label>
              <input
                type="text"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[#111827] border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                placeholder="Enter your Employee ID"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-0.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-3 pr-10 py-2 bg-[#111827] border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
