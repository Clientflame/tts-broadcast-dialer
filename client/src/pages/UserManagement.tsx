import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { Users, UserPlus, Shield, ShieldCheck, Search, Mail, Key, UserCog, Trash2, RotateCcw, Loader2, MoreHorizontal, Headphones, Link2, Unlink, CheckSquare, Square, MinusSquare } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordStrengthIndicator } from "@/components/PasswordStrengthIndicator";
import { validatePassword } from "../../../shared/passwordValidation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const AVAILABLE_PERMISSIONS = [
  { key: "campaigns.view", label: "View Campaigns", category: "Campaigns" },
  { key: "campaigns.create", label: "Create Campaigns", category: "Campaigns" },
  { key: "campaigns.edit", label: "Edit Campaigns", category: "Campaigns" },
  { key: "campaigns.delete", label: "Delete Campaigns", category: "Campaigns" },
  { key: "campaigns.start", label: "Start/Stop Campaigns", category: "Campaigns" },
  { key: "contacts.view", label: "View Contacts", category: "Contacts" },
  { key: "contacts.create", label: "Create Contacts", category: "Contacts" },
  { key: "contacts.edit", label: "Edit Contacts", category: "Contacts" },
  { key: "contacts.delete", label: "Delete Contacts", category: "Contacts" },
  { key: "contacts.import", label: "Import Contacts", category: "Contacts" },
  { key: "audio.view", label: "View Audio Files", category: "Audio" },
  { key: "audio.create", label: "Generate TTS Audio", category: "Audio" },
  { key: "audio.delete", label: "Delete Audio Files", category: "Audio" },
  { key: "callerIds.view", label: "View Caller IDs", category: "Caller IDs" },
  { key: "callerIds.manage", label: "Manage Caller IDs", category: "Caller IDs" },
  { key: "dnc.view", label: "View DNC List", category: "DNC" },
  { key: "dnc.manage", label: "Manage DNC List", category: "DNC" },
  { key: "reports.view", label: "View Reports", category: "Reports" },
  { key: "reports.export", label: "Export Reports", category: "Reports" },
  { key: "auditLog.view", label: "View Audit Log", category: "System" },
  { key: "freepbx.view", label: "View FreePBX Status", category: "System" },
  { key: "freepbx.manage", label: "Manage FreePBX", category: "System" },
  { key: "settings.view", label: "View Settings", category: "System" },
  { key: "settings.manage", label: "Manage Settings", category: "System" },
];

export default function UserManagement() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "groups">("users");

  // New user form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

  // New group form
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [groupPerms, setGroupPerms] = useState<Record<string, boolean>>({});

  const usersQuery = trpc.userManagement.list.useQuery();
  const groupsQuery = trpc.groups.list.useQuery();
  const availableAgents = trpc.agentDashboard.availableAgents.useQuery();
  const utils = trpc.useUtils();

  const linkAgent = trpc.agentDashboard.linkAgent.useMutation({
    onSuccess: () => { toast.success("Agent linked"); utils.userManagement.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const unlinkAgent = trpc.agentDashboard.unlinkAgent.useMutation({
    onSuccess: () => { toast.success("Agent unlinked"); utils.userManagement.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const createUser = trpc.userManagement.createWithPassword.useMutation({
    onSuccess: () => {
      toast.success("User created successfully");
      setShowCreateUser(false);
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setSelectedGroupIds([]);
      utils.userManagement.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRole = trpc.userManagement.updateRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); utils.userManagement.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const addToGroup = trpc.userManagement.addToGroup.useMutation({
    onSuccess: () => { toast.success("Added to group"); utils.userManagement.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const removeFromGroup = trpc.userManagement.removeFromGroup.useMutation({
    onSuccess: () => { toast.success("Removed from group"); utils.userManagement.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: () => {
      toast.success("Group created");
      setShowCreateGroup(false);
      setGroupName(""); setGroupDesc(""); setGroupPerms({});
      utils.groups.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateGroup = trpc.groups.update.useMutation({
    onSuccess: () => { toast.success("Group updated"); utils.groups.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteGroup = trpc.groups.remove.useMutation({
    onSuccess: () => { toast.success("Group deleted"); utils.groups.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteUser = trpc.userManagement.deleteUser.useMutation({
    onSuccess: () => { toast.success("User deleted"); utils.userManagement.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const adminResetPassword = trpc.userManagement.adminResetPassword.useMutation({
    onSuccess: () => { toast.success("Password reset successfully"); setResetPasswordUserId(null); setResetPasswordValue(""); },
    onError: (e) => toast.error(e.message),
  });

  const [resetPasswordUserId, setResetPasswordUserId] = useState<number | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [skipVerification, setSkipVerification] = useState(false);

  // Bulk selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showSingleDeleteConfirm, setShowSingleDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  const bulkDeleteUsers = trpc.userManagement.bulkDeleteUsers.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deletedCount} user(s) deleted${data.skipped > 0 ? ` (${data.skipped} skipped — can't delete yourself)` : ""}`);
      setSelectedUserIds(new Set());
      utils.userManagement.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleSelectUser = (userId: number) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const selectableForDelete = Array.from(selectedUserIds).filter(id => id !== user?.id);

  const resendVerification = trpc.localAuth.resendVerification.useMutation({
    onSuccess: (data) => {
      if (data.emailSent) {
        toast.success("Verification email sent");
      } else {
        toast.warning("Verification token created but email could not be sent. Check SMTP settings.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredUsers = useMemo(() => {
    if (!usersQuery.data) return [];
    if (!search) return usersQuery.data;
    const s = search.toLowerCase();
    return usersQuery.data.filter(u =>
      u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s) || u.role.includes(s)
    );
  }, [usersQuery.data, search]);

  if (user?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You need admin privileges to access user management.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const categories = Array.from(new Set(AVAILABLE_PERMISSIONS.map(p => p.category)));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground text-sm">Manage users, groups, and permissions</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
              <DialogTrigger asChild>
                <Button><UserPlus className="h-4 w-4 mr-2" />Create User</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                  <DialogDescription>Create a user with email/password login</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Full Name</Label>
                      <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Smith" />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Select value={newRole} onValueChange={(v: "user" | "admin") => setNewRole(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" />
                    <PasswordStrengthIndicator password={newPassword} />
                  </div>
                  {groupsQuery.data && groupsQuery.data.length > 0 && (
                    <div>
                      <Label>Groups</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {groupsQuery.data.map(g => (
                          <Badge
                            key={g.id}
                            variant={selectedGroupIds.includes(g.id) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => setSelectedGroupIds(prev =>
                              prev.includes(g.id) ? prev.filter(id => id !== g.id) : [...prev, g.id]
                            )}
                          >
                            {g.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="skipVerification"
                      checked={skipVerification}
                      onChange={e => setSkipVerification(e.target.checked)}
                      className="rounded border-border"
                    />
                    <Label htmlFor="skipVerification" className="text-sm font-normal cursor-pointer">
                      Skip email verification (activate immediately)
                    </Label>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      const pwResult = validatePassword(newPassword);
                      if (!pwResult.isValid) {
                        toast.error(`Password too weak: ${pwResult.errors[0]}`);
                        return;
                      }
                      createUser.mutate({ name: newName, email: newEmail, password: newPassword, role: newRole, groupIds: selectedGroupIds, skipVerification, origin: window.location.origin });
                    }}
                    disabled={!newName || !newEmail || !validatePassword(newPassword).isValid || createUser.isPending}
                  >
                    {createUser.isPending ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "users" ? "bg-background shadow-sm" : "hover:bg-background/50"}`}
          >
            <Users className="h-4 w-4 inline mr-2" />Users ({usersQuery.data?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("groups")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "groups" ? "bg-background shadow-sm" : "hover:bg-background/50"}`}
          >
            <ShieldCheck className="h-4 w-4 inline mr-2" />Groups ({groupsQuery.data?.length || 0})
          </button>
        </div>

        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Bulk action bar */}
            {selectedUserIds.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <span className="text-sm font-medium">
                  {selectedUserIds.size} user{selectedUserIds.size > 1 ? "s" : ""} selected
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (selectableForDelete.length === 0) {
                      toast.error("No valid users to delete (you cannot delete your own account)");
                      return;
                    }
                    setShowBulkDeleteConfirm(true);
                  }}
                  disabled={bulkDeleteUsers.isPending}
                >
                  {bulkDeleteUsers.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Deleting...</>
                  ) : (
                    <><Trash2 className="h-4 w-4 mr-1" />Delete Selected ({selectableForDelete.length})</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUserIds(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
            )}

            <div className="rounded-lg border overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all users"
                      />
                    </th>
                    <th className="text-left p-3 text-sm font-medium">User</th>
                    <th className="text-left p-3 text-sm font-medium">Email</th>
                    <th className="text-left p-3 text-sm font-medium">Login Method</th>
                    <th className="text-left p-3 text-sm font-medium">Role</th>
                    <th className="text-left p-3 text-sm font-medium">Groups</th>
                    <th className="text-left p-3 text-sm font-medium">Linked Agent</th>
                    <th className="text-left p-3 text-sm font-medium">Last Login</th>
                    <th className="text-left p-3 text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id} className={`border-t hover:bg-muted/30 ${selectedUserIds.has(u.id) ? "bg-primary/5" : ""}`}>
                      <td className="p-3 w-10">
                        <Checkbox
                          checked={selectedUserIds.has(u.id)}
                          onCheckedChange={() => toggleSelectUser(u.id)}
                          aria-label={`Select ${u.name || u.email}`}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {(u.name || "?")[0].toUpperCase()}
                          </div>
                          <span className="font-medium">{u.name || "Unnamed"}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{u.email || "-"}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">
                            {u.loginMethod === "email" ? <><Key className="h-3 w-3 mr-1" />Email</> :
                             u.loginMethod === "google" ? <><Mail className="h-3 w-3 mr-1" />Google</> :
                             <><UserCog className="h-3 w-3 mr-1" />{u.loginMethod || "OAuth"}</>}
                          </Badge>
                          {u.hasLocalAuth && !u.isVerified && (
                            <Badge variant="destructive" className="text-xs">Unverified</Badge>
                          )}
                          {u.hasLocalAuth && u.isVerified && (
                            <Badge variant="secondary" className="text-xs text-green-600">Verified</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Select
                          value={u.role}
                          onValueChange={(v: "user" | "admin") => updateRole.mutate({ userId: u.id, role: v })}
                        >
                          <SelectTrigger className="w-24 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {u.groups.map(g => (
                            <Badge key={g.id} variant="secondary" className="text-xs">
                              {g.name}
                              <button
                                className="ml-1 hover:text-destructive"
                                onClick={() => removeFromGroup.mutate({ userId: u.id, groupId: g.id })}
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                          {groupsQuery.data && groupsQuery.data.filter(g => !u.groups.some(ug => ug.id === g.id)).length > 0 && (
                            <Select onValueChange={(v) => addToGroup.mutate({ userId: u.id, groupId: parseInt(v) })}>
                              <SelectTrigger className="h-6 w-6 p-0 border-dashed">
                                <span className="text-xs">+</span>
                              </SelectTrigger>
                              <SelectContent>
                                {groupsQuery.data.filter(g => !u.groups.some(ug => ug.id === g.id)).map(g => (
                                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {u.linkedAgentId ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs">
                              <Headphones className="h-3 w-3 mr-1" />
                              {availableAgents.data?.find(a => a.id === u.linkedAgentId)?.name || `Agent #${u.linkedAgentId}`}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => unlinkAgent.mutate({ userId: u.id })}
                              title="Unlink agent"
                            >
                              <Unlink className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Select onValueChange={(v) => linkAgent.mutate({ userId: u.id, agentId: parseInt(v) })}>
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue placeholder="Link agent..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableAgents.data?.map(a => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                  <div className="flex items-center gap-1">
                                    <Headphones className="h-3 w-3" />
                                    {a.name} (Ext. {a.sipExtension})
                                  </div>
                                </SelectItem>
                              ))}
                              {(!availableAgents.data || availableAgents.data.length === 0) && (
                                <SelectItem value="none" disabled>No agents available</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "-"}
                      </td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {u.loginMethod === "email" && (
                              <DropdownMenuItem onClick={() => { setResetPasswordUserId(u.id); setResetPasswordValue(""); }}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Reset Password
                              </DropdownMenuItem>
                            )}
                            {u.hasLocalAuth && !u.isVerified && (
                              <DropdownMenuItem onClick={() => resendVerification.mutate({ userId: u.id, origin: window.location.origin })}>
                                <Mail className="h-4 w-4 mr-2" />
                                Resend Verification Email
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (u.id === user?.id) {
                                  toast.error("You cannot delete your own account");
                                  return;
                                }
                                setShowSingleDeleteConfirm({ id: u.id, name: u.name || u.email || "this user" });
                              }}
                              disabled={u.id === user?.id}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Single Delete Confirmation Dialog */}
            <AlertDialog open={showSingleDeleteConfirm !== null} onOpenChange={(open) => { if (!open) setShowSingleDeleteConfirm(null); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{showSingleDeleteConfirm?.name}</strong>? This action cannot be undone. All associated data will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      if (showSingleDeleteConfirm) {
                        deleteUser.mutate({ userId: showSingleDeleteConfirm.id });
                        setShowSingleDeleteConfirm(null);
                      }
                    }}
                  >
                    Delete User
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Delete Confirmation Dialog */}
            <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectableForDelete.length} User{selectableForDelete.length > 1 ? "s" : ""}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {selectableForDelete.length} user{selectableForDelete.length > 1 ? "s" : ""} and all their associated data. This action cannot be undone.
                    {selectedUserIds.has(user?.id || 0) && (
                      <span className="block mt-2 text-amber-600 font-medium">Note: Your own account will be skipped.</span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      bulkDeleteUsers.mutate({ userIds: selectableForDelete });
                      setShowBulkDeleteConfirm(false);
                    }}
                  >
                    Delete {selectableForDelete.length} User{selectableForDelete.length > 1 ? "s" : ""}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Admin Reset Password Dialog */}
            <Dialog open={resetPasswordUserId !== null} onOpenChange={(open) => { if (!open) { setResetPasswordUserId(null); setResetPasswordValue(""); } }}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Reset User Password</DialogTitle>
                  <DialogDescription>
                    Set a new password for {filteredUsers.find(u => u.id === resetPasswordUserId)?.name || "this user"}.
                    The user will need to use this new password to log in.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={resetPasswordValue}
                      onChange={e => setResetPasswordValue(e.target.value)}
                      placeholder="Minimum 8 characters"
                      autoComplete="new-password"
                    />
                    <PasswordStrengthIndicator password={resetPasswordValue} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        const pwResult = validatePassword(resetPasswordValue);
                        if (!pwResult.isValid) {
                          toast.error(`Password too weak: ${pwResult.errors[0]}`);
                          return;
                        }
                        if (resetPasswordUserId) {
                          adminResetPassword.mutate({ userId: resetPasswordUserId, newPassword: resetPasswordValue });
                        }
                      }}
                      disabled={!validatePassword(resetPasswordValue).isValid || adminResetPassword.isPending}
                    >
                      {adminResetPassword.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting...</>
                      ) : (
                        "Reset Password"
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => { setResetPasswordUserId(null); setResetPasswordValue(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {activeTab === "groups" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
                <DialogTrigger asChild>
                  <Button variant="outline"><ShieldCheck className="h-4 w-4 mr-2" />Create Group</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Permission Group</DialogTitle>
                    <DialogDescription>Define a group with specific permissions that can be assigned to users</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Group Name</Label>
                        <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g., Campaign Managers" />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input value={groupDesc} onChange={e => setGroupDesc(e.target.value)} placeholder="Optional description" />
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <Label className="text-base font-semibold">Permissions</Label>
                      <div className="mt-3 space-y-4">
                        {categories.map(cat => (
                          <div key={cat}>
                            <h4 className="text-sm font-medium text-muted-foreground mb-2">{cat}</h4>
                            <div className="grid grid-cols-2 gap-2">
                              {AVAILABLE_PERMISSIONS.filter(p => p.category === cat).map(p => (
                                <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded p-1.5">
                                  <input
                                    type="checkbox"
                                    checked={groupPerms[p.key] || false}
                                    onChange={e => setGroupPerms(prev => ({ ...prev, [p.key]: e.target.checked }))}
                                    className="rounded"
                                  />
                                  {p.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          const activePerms: Record<string, boolean> = {};
                          Object.entries(groupPerms).forEach(([k, v]) => { if (v) activePerms[k] = true; });
                          createGroup.mutate({ name: groupName, description: groupDesc || undefined, permissions: activePerms });
                        }}
                        disabled={!groupName || createGroup.isPending}
                        className="flex-1"
                      >
                        {createGroup.isPending ? "Creating..." : "Create Group"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          AVAILABLE_PERMISSIONS.forEach(p => { all[p.key] = true; });
                          setGroupPerms(all);
                        }}
                      >
                        Select All
                      </Button>
                      <Button variant="outline" onClick={() => setGroupPerms({})}>Clear All</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupsQuery.data?.map(group => {
                const perms = (group.permissions as Record<string, boolean>) || {};
                const permCount = Object.values(perms).filter(Boolean).length;
                return (
                  <Card key={group.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{group.name}</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Delete this group?")) deleteGroup.mutate({ id: group.id }); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {group.description && <CardDescription>{group.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{permCount} permissions</span>
                        {group.isDefault === 1 && <Badge variant="secondary">Default</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(perms).filter(([, v]) => v).slice(0, 5).map(([key]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {AVAILABLE_PERMISSIONS.find(p => p.key === key)?.label || key}
                          </Badge>
                        ))}
                        {permCount > 5 && (
                          <Badge variant="outline" className="text-xs">+{permCount - 5} more</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Created {new Date(group.createdAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
              {(!groupsQuery.data || groupsQuery.data.length === 0) && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No groups created yet</p>
                  <p className="text-sm">Create a group to assign permissions to users</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
