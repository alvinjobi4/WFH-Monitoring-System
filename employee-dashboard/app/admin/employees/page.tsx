"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import Link from "next/link";
import { FALLBACK_ROLES } from "../../../lib/classifier";
import Dropdown from "../../components/Dropdown";

export default function ManageEmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [isLoading, setIsLoading] = useState(true);

  // Roles list from either DB or local fallbacks
  const [roles, setRoles] = useState<any[]>([]);
  const [employeeRolesMap, setEmployeeRolesMap] = useState<Record<string, string>>({});

  const roleOptions = useMemo(() => {
    return roles.map(role => ({
      value: role.id,
      label: role.name.replace("_", " ").toUpperCase()
    }));
  }, [roles]);

  const filterRoleOptions = useMemo(() => {
    return [
      { value: "All", label: "ALL DESIGNATIONS" },
      ...roles.map(role => ({
        value: role.name,
        label: role.name.replace(/_/g, " ").toUpperCase()
      }))
    ];
  }, [roles]);

  const filteredEmployeesList = useMemo(() => {
    let list = employees;
    
    if (filterRole !== "All") {
      list = employees.filter(emp => {
        const dept = (emp.department || "").toLowerCase().trim();
        const matchedRole = roles.find(role => {
          const rName = role.name.toLowerCase().replace(/_/g, " ").trim();
          const dName = dept.replace(/_/g, " ").trim();

          if (rName === dName || rName.includes(dName) || dName.includes(rName)) {
            return true;
          }

          // Standard mapping fallbacks
          const rLower = role.name.toLowerCase();
          const isSoftwareRole = rLower === "software_developer" || rLower === "software developer" || rLower === "role_2";
          const isDesignRole = rLower === "designer" || rLower === "role_3";
          const isRecruiterRole = rLower === "recruiter" || rLower === "role_4";

          if (dName.includes("engineering") || dName.includes("software") || dName.includes("developer") || dName.includes("dev")) {
            return isSoftwareRole;
          }
          if (dName.includes("design") || dName.includes("electrical") || dName.includes("designer") || dName.includes("frontend")) {
            return isDesignRole;
          }
          if (dName.includes("recruiter") || dName.includes("hr") || dName.includes("hiring") || dName.includes("talent")) {
            return isRecruiterRole;
          }

          return false;
        });

        const empRoleName = matchedRole ? matchedRole.name : (roles.find(r => {
          const rLower = r.name.toLowerCase();
          return rLower === "knowledge_worker" || rLower === "knowledge worker" || rLower === "role_1";
        })?.name || roles[0]?.name || "");

        return empRoleName === filterRole;
      });
    }

    const term = searchTerm.trim().toLowerCase();
    if (!term) return list;
    return list.filter(emp =>
      (emp.name || "").toLowerCase().includes(term) ||
      (emp.id || "").toLowerCase().includes(term) ||
      (emp.email || "").toLowerCase().includes(term) ||
      (emp.department || "").toLowerCase().includes(term)
    );
  }, [employees, searchTerm, filterRole, roles]);

  const designationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    roles.forEach(role => {
      counts[role.name] = 0;
    });

    employees.forEach(emp => {
      if (emp.id === "admin" || emp.role === "admin") return; // Skip counting admin for designations
      const dept = (emp.department || "").toLowerCase().trim();
      const matchedRole = roles.find(role => {
        const rName = role.name.toLowerCase().replace(/_/g, " ").trim();
        const dName = dept.replace(/_/g, " ").trim();

        if (rName === dName || rName.includes(dName) || dName.includes(rName)) {
          return true;
        }

        // Standard mapping fallbacks
        const rLower = role.name.toLowerCase();
        const isSoftwareRole = rLower === "software_developer" || rLower === "software developer" || rLower === "role_2";
        const isDesignRole = rLower === "designer" || rLower === "role_3";
        const isRecruiterRole = rLower === "recruiter" || rLower === "role_4";

        if (dName.includes("engineering") || dName.includes("software") || dName.includes("developer") || dName.includes("dev")) {
          return isSoftwareRole;
        }
        if (dName.includes("design") || dName.includes("electrical") || dName.includes("designer") || dName.includes("frontend")) {
          return isDesignRole;
        }
        if (dName.includes("recruiter") || dName.includes("hr") || dName.includes("hiring") || dName.includes("talent")) {
          return isRecruiterRole;
        }

        return false;
      });

      if (matchedRole) {
        counts[matchedRole.name] = (counts[matchedRole.name] || 0) + 1;
      } else {
        const defaultRole = roles.find(r => {
          const rLower = r.name.toLowerCase();
          return rLower === "knowledge_worker" || rLower === "knowledge worker" || rLower === "role_1";
        }) || roles[0];
        if (defaultRole) {
          counts[defaultRole.name] = (counts[defaultRole.name] || 0) + 1;
        }
      }
    });

    return counts;
  }, [roles, employees]);


  // Form State
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmpId, setNewEmpId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState("");

  // Designation Form State
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [parentRoleId, setParentRoleId] = useState("");
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [roleMessage, setRoleMessage] = useState("");

  // Delete Modal State
  const [employeeToDelete, setEmployeeToDelete] = useState<{ id: string, name: string, userId: string | null } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Inline State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    email: "",
    department: "",
    device_id: "",
    password: ""
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Edit Role Inline State
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleForm, setEditRoleForm] = useState({
    id: "",
    name: "",
    description: ""
  });
  const [isSavingRoleEdit, setIsSavingRoleEdit] = useState(false);

  // =================================================
  // AUTH CHECK
  // =================================================
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      router.push("/");
    } else {
      loadInitialData();
    }
  }, [router]);

  async function loadInitialData() {
    await fetchRoles();
    await fetchEmployees();
  }

  async function fetchRoles() {
    try {
      const { data, error } = await supabase
        .from("roles")
        .select("*");

      if (!error && data && data.length > 0) {
        setRoles(data);
        // Default select to knowledge_worker if available
        const defaultRole = data.find((r: any) => r.name === "knowledge_worker") || data[0];
        if (defaultRole) setSelectedRoleId(defaultRole.id);
      } else {
        // Fallback
        const fallbackList = Object.values(FALLBACK_ROLES);
        setRoles(fallbackList);
        setSelectedRoleId(fallbackList[0]?.id || "");
      }
    } catch (e) {
      const fallbackList = Object.values(FALLBACK_ROLES);
      setRoles(fallbackList);
      setSelectedRoleId(fallbackList[0]?.id || "");
    }
  }

  async function fetchEmployees() {
    try {
      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select("*")
        .order("id", { ascending: true });

      if (empError) throw empError;

      const merged = empData.map((emp: any) => {
        return {
          ...emp,
          username: emp.name,
          password: emp.password || "(No password set)",
          userId: emp.id,
        };
      });

      setEmployees(merged);
    } catch (err) {
      console.error("Error fetching employees:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setMessage("");

    const trimmedEmpId = newEmpId.trim();
    if (trimmedEmpId.toLowerCase() === "admin") {
      setMessage("Error: The ID 'admin' is reserved for the admin account.");
      setIsAdding(false);
      return;
    }
    const trimmedUsername = newUsername.trim();
    const trimmedPassword = newPassword.trim();
    const trimmedEmail = newEmail.trim();
    const trimmedDeviceId = newDeviceId.trim() || "pc";
    const trimmedDepartment = newDepartment.trim() || "Engineering";

    try {
      // 1. Insert into employees table
      const { error: empError } = await supabase
        .from("employees")
        .insert([{
          id: trimmedEmpId,
          name: trimmedUsername,
          email: trimmedEmail,
          device_id: trimmedDeviceId,
          department: trimmedDepartment,
          password: trimmedPassword,
          role: "employee"
        }]);

      if (empError) {
        setMessage(`Error adding employee profile: ${empError.message}`);
      } else {
        setMessage("Employee account created successfully!");
        setNewEmpId("");
        setNewUsername("");
        setNewPassword("");
        setNewEmail("");
        setNewDeviceId("");
        setNewDepartment("");
        fetchEmployees(); // Refresh list
      }
    } catch (err) {
      setMessage("An unexpected error occurred.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingRole(true);
    setRoleMessage("");

    // Slugify name for consistent role naming in classifier (e.g. "QA Engineer" -> "qa_engineer")
    const formattedName = newRoleName.trim().toLowerCase().replace(/\s+/g, "_");

    if (!formattedName) {
      setRoleMessage("Error: Designation name cannot be empty.");
      setIsAddingRole(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("roles")
        .insert([{
          name: formattedName,
          description: newRoleDescription
        }]);

      if (error) {
        setRoleMessage(`Error: ${error.message} (Code: ${error.code || 'unknown'})`);
      } else {
        setRoleMessage("Designation created successfully!");
        setNewRoleName("");
        setNewRoleDescription("");
        await fetchRoles(); // Refresh designation options dropdowns immediately!
      }
    } catch (err) {
      setRoleMessage("An unexpected error occurred.");
    } finally {
      setIsAddingRole(false);
    }
  };

  const handleStartEdit = (emp: any) => {
    setEditingId(emp.id);
    setEditForm({
      id: emp.id,
      name: emp.name,
      email: emp.email || "",
      department: emp.department || "Engineering",
      device_id: emp.device_id || "pc",
      password: emp.password || ""
    });
  };

  const handleSaveEdit = async (emp: any) => {
    setIsSavingEdit(true);
    setMessage("");

    const oldId = emp.id;
    const newId = editForm.id.trim();

    if (!newId) {
      setMessage("Error: Employee ID cannot be empty.");
      setIsSavingEdit(false);
      return;
    }

    if (oldId === "admin" && newId !== "admin") {
      setMessage("Error: Admin ID must remain strictly 'admin'.");
      setIsSavingEdit(false);
      return;
    }

    if (oldId !== "admin" && newId.toLowerCase() === "admin") {
      setMessage("Error: The ID 'admin' is reserved for the admin account.");
      setIsSavingEdit(false);
      return;
    }

    try {
      // If ID changed, verify that the new ID doesn't already exist
      if (oldId !== newId) {
        const { data: existingEmp, error: checkError } = await supabase
          .from("employees")
          .select("id")
          .eq("id", newId)
          .maybeSingle();

        if (checkError) {
          setMessage(`Error checking ID uniqueness: ${checkError.message}`);
          setIsSavingEdit(false);
          return;
        }

        if (existingEmp) {
          setMessage(`Error: Employee ID '${newId}' is already in use.`);
          setIsSavingEdit(false);
          return;
        }
      }

      // Update employee table
      const updatePayload: any = {
        name: editForm.name,
        email: editForm.email,
        device_id: editForm.device_id,
        department: editForm.department,
        password: editForm.password
      };

      if (oldId !== newId) {
        updatePayload.id = newId;
      }

      const { error: empError } = await supabase
        .from("employees")
        .update(updatePayload)
        .eq("id", oldId);

      if (empError) {
        setMessage(`Error updating employee: ${empError.message}`);
        setIsSavingEdit(false);
        return;
      }

      // Sync activity logs to the new ID/details
      const { error: logsError } = await supabase
        .from("activity_logs")
        .update({
          employee_id: newId,
          employee_name: editForm.name,
          employee_email: editForm.email,
          device_id: editForm.device_id,
          department: editForm.department
        })
        .eq("employee_id", oldId);

      if (logsError) {
        console.error("Error updating activity logs:", logsError);
      }

      setMessage("Employee updated successfully!");
      setEditingId(null);
      await fetchEmployees(); // Refresh employee list
    } catch (err) {
      console.error(err);
      setMessage("An unexpected error occurred while saving.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleStartRoleEdit = (role: any) => {
    setEditingRoleId(role.id);
    setEditRoleForm({
      id: role.id,
      name: role.name.replace(/_/g, " "),
      description: role.description || ""
    });
  };

  const handleSaveRoleEdit = async () => {
    setIsSavingRoleEdit(true);
    setRoleMessage("");
    const formattedName = editRoleForm.name.trim().toLowerCase().replace(/\s+/g, "_");

    if (!formattedName) {
      setRoleMessage("Error: Designation name cannot be empty.");
      setIsSavingRoleEdit(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("roles")
        .update({
          name: formattedName,
          description: editRoleForm.description
        })
        .eq("id", editRoleForm.id);

      if (error) {
        setRoleMessage(`Error updating designation: ${error.message}`);
      } else {
        setRoleMessage("Designation updated successfully!");
        setEditingRoleId(null);
        await fetchRoles(); // Refresh roles list
      }
    } catch (err) {
      setRoleMessage("An unexpected error occurred.");
    } finally {
      setIsSavingRoleEdit(false);
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    const displayName = roleName.replace(/_/g, " ").toUpperCase();
    if (!window.confirm(`Are you sure you want to delete the designation "${displayName}"?`)) {
      return;
    }

    setRoleMessage("");
    try {
      const { error } = await supabase
        .from("roles")
        .delete()
        .eq("id", roleId);

      if (error) {
        setRoleMessage(`Error deleting designation: ${error.message}`);
      } else {
        setRoleMessage("Designation deleted successfully!");
        await fetchRoles(); // Refresh roles list
      }
    } catch (err) {
      setRoleMessage("An unexpected error occurred while deleting.");
    }
  };

  const initiateDelete = (id: string, name: string, userId: string | null) => {
    setEmployeeToDelete({ id, name, userId });
    setDeleteConfirmText("");
  };

  const confirmDelete = async () => {
    if (!employeeToDelete || deleteConfirmText.toLowerCase() !== "confirm") return;
    setIsDeleting(true);

    try {
      // 1. Delete from employees table
      const { error: empError } = await supabase
        .from("employees")
        .delete()
        .eq("id", employeeToDelete.id);

      if (empError) {
        setMessage(`Error deleting employee profile: ${empError.message}`);
      } else {
        setMessage(`Employee ${employeeToDelete.name} removed successfully.`);
        fetchEmployees(); // Refresh list
      }
    } catch (err) {
      setMessage("An unexpected error occurred.");
    } finally {
      setEmployeeToDelete(null);
      setIsDeleting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  if (isLoading) return (
    <div className="min-h-screen bg-[#070b13] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading database...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 md:p-6 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      {/* Background flat canvas */}
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="max-w-7xl mx-auto space-y-4 relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 border-b border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              HR Management <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 text-slate-400 border border-slate-800 rounded">Console</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-wide uppercase">
              Operational Workforce Account Control
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/admin"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              &larr; Back to Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/20 rounded transition-all text-xs font-medium cursor-pointer"
            >
              Logout
            </button>
          </div>
        </header>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <div className="col-span-1 space-y-4">
            {/* Add Employee Form */}
            <div className="relative group">
              <div className="relative bg-[#121826] border border-slate-800 rounded overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Add New Hire</h2>
                  </div>
                </div>

                <div className="p-3.5">
                  <form onSubmit={handleAddEmployee} className="space-y-3">
                    {message && (
                      <div className={`p-2.5 rounded text-xs font-medium ${message.toLowerCase().includes("error") ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'}`}>
                        {message}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Employee ID</label>
                      <input
                        type="text"
                        value={newEmpId}
                        onChange={(e) => setNewEmpId(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all font-mono"
                        placeholder="e.g. EMP009"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Full Name</label>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all"
                        placeholder="e.g. Dhruv"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Email Address</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all"
                        placeholder="e.g. dhruv@company.com"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all font-mono"
                        placeholder="Account login password"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Device ID</label>
                      <input
                        type="text"
                        value={newDeviceId}
                        onChange={(e) => setNewDeviceId(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all font-mono"
                        placeholder="e.g. pc (Default: pc)"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Department / Designation</label>
                      <input
                        type="text"
                        value={newDepartment}
                        onChange={(e) => setNewDepartment(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all"
                        placeholder="e.g. Engineering"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isAdding}
                      className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded border border-blue-700/30 transition-all text-xs font-semibold cursor-pointer mt-1"
                    >
                      {isAdding ? "Creating Profile..." : "Add Employee"}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Add New Designation Form */}
            <div className="relative group">
              <div className="relative bg-[#121826] border border-slate-800 rounded overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Add New Designation</h2>
                  </div>
                </div>

                <div className="p-3.5">
                  <form onSubmit={handleAddRole} className="space-y-3">
                    {roleMessage && (
                      <div className={`p-2.5 rounded text-xs font-medium ${roleMessage.includes("Error") ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'}`}>
                        {roleMessage}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Designation Name</label>
                      <input
                        type="text"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all"
                        placeholder="e.g. QA Engineer"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Description</label>
                      <textarea
                        value={newRoleDescription}
                        onChange={(e) => setNewRoleDescription(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all h-20 resize-none"
                        placeholder="Brief description..."
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isAddingRole}
                      className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded border border-blue-700/30 transition-all text-xs font-semibold cursor-pointer mt-1"
                    >
                      {isAddingRole ? "Creating..." : "Create Designation"}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Current Designations List */}
            <div className="relative group">
              <div className="relative bg-[#121826] border border-slate-800 rounded overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Current Designations</h2>
                  </div>
                </div>

                <div className="p-3.5 space-y-2 max-h-60 overflow-y-auto">
                  {roles.map((role) => {
                    const isEditingRole = editingRoleId === role.id;
                    const count = designationCounts[role.name] || 0;
                    const displayName = role.name.replace(/_/g, " ").toUpperCase();
                    return (
                      <div key={role.id} className="bg-[#111827]/40 border border-slate-800 rounded p-2 text-xs flex flex-col gap-2">
                        {isEditingRole ? (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Name</label>
                              <input
                                type="text"
                                value={editRoleForm.name}
                                onChange={(e) => setEditRoleForm({ ...editRoleForm, name: e.target.value })}
                                className="w-full px-2 py-1 bg-[#111827] border border-slate-800 rounded text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Description</label>
                              <textarea
                                value={editRoleForm.description}
                                onChange={(e) => setEditRoleForm({ ...editRoleForm, description: e.target.value })}
                                className="w-full px-2 py-1 bg-[#111827] border border-slate-800 rounded text-slate-205 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 h-12 resize-none"
                              />
                            </div>
                            <div className="flex justify-end gap-1.5 mt-1">
                              <button
                                onClick={handleSaveRoleEdit}
                                disabled={isSavingRoleEdit}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Save
                              </button>
                              <button
                                onClick={() => setEditingRoleId(null)}
                                className="px-2 py-1 bg-slate-850 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center group/role-item">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-200">{displayName}</span>
                              {role.description && (
                                <span className="text-[10px] text-slate-500 max-w-[180px] truncate">{role.description}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full font-mono font-semibold text-[10px]">
                                {count} {count === 1 ? 'emp' : 'emps'}
                              </span>
                              
                              <div className="flex items-center opacity-0 group-hover/role-item:opacity-100 transition-all">
                                <button
                                  onClick={() => handleStartRoleEdit(role)}
                                  className="p-1 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-all cursor-pointer"
                                  title="Edit Designation"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteRole(role.id, role.name)}
                                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all cursor-pointer"
                                  title="Delete Designation"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18"></path>
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {roles.length === 0 && (
                    <div className="text-slate-500 text-xs text-center font-mono py-4">
                      No designations defined.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Employee List */}
          <div className="relative group col-span-1 lg:col-span-2">
            <div className="relative bg-[#121826] border border-slate-800 rounded overflow-hidden h-full">
              <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Active Employees</h2>
                </div>
                <div className="flex items-center gap-2 z-40">
                  <Dropdown
                    options={filterRoleOptions}
                    value={filterRole}
                    onChange={setFilterRole}
                    label="Role:"
                  />
                  <div className="relative w-48">
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#121826] hover:bg-[#121826]/80 border border-white/5 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs font-medium transition-colors"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs focus:outline-none cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
                <table className="w-full text-xs text-left whitespace-nowrap border-collapse">
                  <thead className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-[#111827]/40 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Emp ID</th>
                      <th className="px-4 py-2 font-semibold">Name</th>
                      <th className="px-4 py-2 font-semibold">Email</th>
                      <th className="px-4 py-2 font-semibold">Department</th>
                      <th className="px-4 py-2 font-semibold">Device ID</th>
                      <th className="px-4 py-2 font-semibold">Password</th>
                      <th className="px-4 py-2 font-semibold text-right sticky right-0 bg-[#121927] border-l border-slate-800/80 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.6)] z-30">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredEmployeesList.map((emp) => {
                      const isEditing = editingId === emp.id;
                      return (
                        <tr key={emp.id} className={`hover:bg-slate-800/30 transition-colors group/row ${isEditing ? 'bg-blue-500/5' : ''}`}>
                          <td className="px-4 py-1.5 font-mono text-xs text-blue-400">
                            {isEditing ? (
                              emp.id === "admin" || emp.role === "admin" ? (
                                <span className="text-slate-400">admin</span>
                              ) : (
                                <input
                                  type="text"
                                  value={editForm.id}
                                  onChange={(e) => setEditForm({ ...editForm, id: e.target.value })}
                                  className="px-2 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white max-w-[90px]"
                                />
                              )
                            ) : (
                              emp.id
                            )}
                          </td>
                          <td className="px-4 py-1.5 font-medium text-slate-200">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="px-2 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white max-w-[120px]"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center font-semibold text-[10px] border border-blue-500/20">
                                  {emp.name.charAt(0).toUpperCase()}
                                </div>
                                {emp.name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-slate-350 text-xs">
                            {isEditing ? (
                              <input
                                type="email"
                                value={editForm.email}
                                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                className="px-2 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white max-w-[150px]"
                              />
                            ) : (
                              emp.email || "-"
                            )}
                          </td>
                          <td className="px-4 py-1.5">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editForm.department}
                                onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                                className="px-2 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white max-w-[100px]"
                              />
                            ) : (
                              <span className="bg-[#111827] px-1.5 py-0.5 border border-slate-800 rounded text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                                {emp.department || "Engineering"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-slate-400 font-mono text-xs">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editForm.device_id}
                                onChange={(e) => setEditForm({ ...editForm, device_id: e.target.value })}
                                className="px-2 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white font-mono max-w-[100px]"
                              />
                            ) : (
                              emp.device_id || "pc"
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-slate-400 font-mono text-xs">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editForm.password}
                                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                className="px-2 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white font-mono max-w-[100px]"
                              />
                            ) : (
                              emp.password
                            )}
                          </td>
                          <td className={`px-4 py-1.5 text-right whitespace-nowrap sticky right-0 border-l border-slate-800/60 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.6)] z-20 transition-colors ${
                            isEditing 
                              ? 'bg-[#151d30]' 
                              : 'bg-[#121826] group-hover/row:bg-[#1a2335]'
                          }`}>
                            {isEditing ? (
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => handleSaveEdit(emp)}
                                  disabled={isSavingEdit}
                                  className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                                  title="Save Changes"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1 text-slate-500 hover:bg-slate-500/10 rounded transition-all cursor-pointer"
                                  title="Cancel"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                  </svg>
                                </button>
                              </div>
                            ) : (
                               <div className="flex justify-end gap-1.5 opacity-0 group-hover/row:opacity-100 transition-all">
                                <button
                                  onClick={() => handleStartEdit(emp)}
                                  className="p-1 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-all cursor-pointer"
                                  title="Edit Employee"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                {emp.id !== "admin" && emp.role !== "admin" && (
                                  <button
                                    onClick={() => initiateDelete(emp.id, emp.name, emp.userId)}
                                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all cursor-pointer"
                                    title="Delete Employee"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M3 6h18"></path>
                                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredEmployeesList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500 font-mono text-xs">
                          {searchTerm ? "No matching employees found." : "No employees found. Add one on the left!"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        {/* Delete Confirmation Modal */}
        {employeeToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-[#121826] border border-slate-800 rounded p-5 w-full max-w-md shadow-lg animate-in fade-in duration-150">
              <h3 className="text-sm font-semibold text-rose-400 mb-2">Delete Employee</h3>
              <p className="text-slate-400 text-xs mb-4 leading-relaxed">
                This action cannot be undone. To permanently delete <strong className="text-slate-205">{employeeToDelete.name} ({employeeToDelete.id})</strong>, please type <strong className="text-rose-400 font-semibold">confirm</strong> below.
              </p>

              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type confirm here..."
                className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-xs text-white placeholder-slate-600 transition-all mb-4"
              />

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEmployeeToDelete(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-350 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleteConfirmText.toLowerCase() !== "confirm" || isDeleting}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:bg-rose-500/50 disabled:text-white/50 border border-rose-700/30 rounded transition-all"
                >
                  {isDeleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

