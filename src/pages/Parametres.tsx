import { useState, useEffect } from 'react'
import { Sun, Database, Globe, Trash2, Plus, Users, Shield, Pencil, Eye, Key, UserCheck, UserX, Save, Check, AlertTriangle } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import CacheStatus from '@/components/CacheStatus'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { 
  getAllUsers, 
  createUser, 
  deleteUser, 
  getCurrentUser, 
  updateUserPassword, 
  updateUserRole, 
  toggleUserActive, 
  verifyCurrentPassword,
  updateUserProfile,
  AppUser 
} from '@/lib/auth'
import { toast } from 'sonner'

export default function Parametres() {
  const [showCacheStatus, setShowCacheStatus] = useState(false)
  const { t, i18n } = useTranslation()

  // User Management State
  const [users, setUsers] = useState<Omit<AppUser, 'passwordHash'>[]>([])
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<AppUser['role']>('viewer')
  
  const [changingPasswordFor, setChangingPasswordFor] = useState<string | null>(null)
  const [newPassInput, setNewPassInput] = useState('')
  
  const currentUser = getCurrentUser()
  const isAdmin = currentUser?.role === 'admin'

  // My Profile State
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState(currentUser?.name ?? '')
  const [profileEmail, setProfileEmail] = useState(currentUser?.email ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newProfilePassword, setNewProfilePassword] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  const refreshUsers = () => {
    if (isAdmin) {
      setUsers(getAllUsers())
    }
  }

  useEffect(() => {
    refreshUsers()
  }, [isAdmin])

  const handleAddUser = async () => {
    if (!newUserName || !newUserEmail || !newUserPassword) return
    try {
      await createUser({
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
      })
      setNewUserName('')
      setNewUserEmail('')
      setNewUserPassword('')
      setNewUserRole('viewer')
      toast.success(`Utilisateur ${newUserName} créé avec succès`)
      refreshUsers()
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création')
    }
  }

  const handleDeleteUser = (userId: string) => {
    const result = deleteUser(userId)
    if (result.success) {
      refreshUsers()
      toast.success('Utilisateur supprimé')
    } else {
      toast.error(result.error ?? 'Erreur lors de la suppression')
    }
  }

  const handleChangePassword = async (userId: string) => {
    if (!newPassInput || newPassInput.length < 4) {
      toast.error('Mot de passe trop court (min 4 caractères)')
      return
    }
    try {
      await updateUserPassword(userId, newPassInput)
      setChangingPasswordFor(null)
      setNewPassInput('')
      toast.success('Mot de passe modifié')
    } catch (err) {
      toast.error('Erreur lors du changement de mot de passe')
    }
  }

  const handleChangeRole = (userId: string, role: AppUser['role']) => {
    updateUserRole(userId, role)
    refreshUsers()
    toast.success('Rôle mis à jour')
  }

  const handleToggleActive = (userId: string) => {
    if (userId === currentUser?.id) {
      toast.error('Vous ne pouvez pas vous désactiver vous-même')
      return
    }
    toggleUserActive(userId)
    refreshUsers()
    toast.success('Statut mis à jour')
  }

  const handleLanguageChange = (lang: 'fr' | 'en') => {
    i18n.changeLanguage(lang)
    localStorage.setItem('stlr_language', lang)
  }

  const handleSaveProfile = async () => {
    setProfileError('')
    setProfileSuccess('')
    
    if (!profileName.trim() || !profileEmail.trim()) {
      setProfileError('Nom et email sont obligatoires')
      return
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(profileEmail)) {
      setProfileError('Format email invalide')
      return
    }
    
    // If changing password, verify current password
    if (newProfilePassword) {
      if (!currentPassword) {
        setProfileError('Saisissez votre mot de passe actuel pour le modifier')
        return
      }
      if (newProfilePassword.length < 4) {
        setProfileError('Le nouveau mot de passe doit contenir au moins 4 caractères')
        return
      }
      
      // Verify current password
      const isValid = await verifyCurrentPassword(currentUser!.id, currentPassword)
      if (!isValid) {
        setProfileError('Mot de passe actuel incorrect')
        return
      }
    }
    
    try {
      // Update name and email
      await updateUserProfile(currentUser!.id, {
        name: profileName.trim(),
        email: profileEmail.trim().toLowerCase(),
      })
      
      // Update password if provided
      if (newProfilePassword && currentPassword) {
        await updateUserPassword(currentUser!.id, newProfilePassword)
      }
      
      setProfileSuccess('Profil mis à jour avec succès')
      setCurrentPassword('')
      setNewProfilePassword('')
      setEditingProfile(false)
      
      // Refresh user data in state
      refreshUsers()
      toast.success('Profil mis à jour')
      
    } catch (err) {
      if (err instanceof Error && err.message === 'Email already in use') {
        setProfileError('Cet email est déjà utilisé par un autre compte')
      } else {
        setProfileError('Erreur lors de la mise à jour')
      }
    }
  }

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 max-w-4xl mx-auto w-full mt-4">
      
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-white">{t('parametres.title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configuration système et maintenance de l'application
        </p>
      </div>

      <div className="space-y-4">
        {/* Language Settings */}
        <div className="bg-card/40 border border-border/50 rounded-2xl p-5 backdrop-blur-sm hover:border-border transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary/50 rounded-xl">
                <Globe className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-white uppercase tracking-wider">{t('parametres.langue')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {i18n.language === 'fr' ? 'Choisir la langue de l\'interface' : 'Choose application language'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 bg-secondary/40 rounded-xl p-1">
              <button
                onClick={() => handleLanguageChange('fr')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  i18n.language === 'fr'
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
              >
                🇫🇷 {t('parametres.langue_fr')}
              </button>
              <button
                onClick={() => handleLanguageChange('en')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  i18n.language === 'en'
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
              >
                🇬🇧 {t('parametres.langue_en')}
              </button>
            </div>
          </div>
        </div>

        {/* Theme Settings */}
        <div className="bg-card/40 border border-border/50 rounded-2xl p-5 backdrop-blur-sm hover:border-border transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary/50 rounded-xl">
                <Sun className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-white uppercase tracking-wider">{t('parametres.theme')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Basculer entre le mode clair et le mode sombre
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Cache Management */}
        <div className="bg-card/40 border border-border/50 rounded-2xl p-5 backdrop-blur-sm hover:border-border transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary/50 rounded-xl">
                <Database className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-white uppercase tracking-wider">{t('parametres.cache')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Consulter l'utilisation d'IndexedDB et forcer le nettoyage du stockage
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowCacheStatus(true)}
              className="font-bold rounded-xl border-border/60 hover:bg-secondary/40 h-10 px-5"
            >
              <Database className="h-4 w-4 mr-2" />
              Voir le statut
            </Button>
          </div>
        </div>

        {/* My Profile Section — Visible to all logged-in users */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border/40 bg-secondary/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">Mon Profil</h3>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-0.5">
                  Gérer mes informations personnelles
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                ⚙️ {currentUser?.role === 'admin' ? 'Administrateur' : currentUser?.role === 'operator' ? 'Opérateur' : 'Observateur'}
              </span>
              <button
                onClick={() => {
                  setEditingProfile(!editingProfile)
                  setProfileError('')
                  setProfileSuccess('')
                  setCurrentPassword('')
                  setNewProfilePassword('')
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  editingProfile
                    ? 'bg-secondary border-border text-foreground'
                    : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}>
                <Pencil className="h-3 w-3" />
                {editingProfile ? 'Annuler' : 'Modifier'}
              </button>
            </div>
          </div>
          
          {editingProfile && (
            <div className="p-5 bg-secondary/10 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nom complet</label>
                  <input
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    placeholder="Nom complet"
                    className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-all font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email</label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={e => setProfileEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-all font-medium"
                  />
                </div>
              </div>
              
              <div className="pt-2 border-t border-border/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Changer le mot de passe (optionnel)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Mot de passe actuel</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Indispensable pour changer le mdp"
                      className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nouveau mot de passe</label>
                    <input
                      type="password"
                      value={newProfilePassword}
                      onChange={e => setNewProfilePassword(e.target.value)}
                      placeholder="Min. 4 caractères"
                      className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-all"
                    />
                  </div>
                </div>
              </div>

              {profileError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold animate-in zoom-in-95 duration-200">
                  <AlertTriangle className="h-4 w-4" />
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold animate-in zoom-in-95 duration-200">
                  <Check className="h-4 w-4" />
                  {profileSuccess}
                </div>
              )}
              
              <button
                onClick={handleSaveProfile}
                disabled={!profileName.trim() || !profileEmail.trim()}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/20 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                Enregistrer les modifications
              </button>
            </div>
          )}
        </div>

        {/* User Management (Admin Only) */}
        {isAdmin && (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border/40 bg-secondary/20 flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">
                  Gestion des utilisateurs
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-0.5">
                  Contrôle des accès et permissions
                </p>
              </div>
            </div>
            
            {/* User list */}
            <div className="p-4 space-y-2">
              {users.map(user => (
                <div key={user.id} 
                  className="flex flex-col p-3 bg-secondary/30 rounded-lg border border-border/10 hover:border-border/40 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-inner ${
                        user.role === 'admin' ? 'bg-primary/20 text-primary'
                        : user.role === 'operator' ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-foreground leading-tight">{user.name}</p>
                          {!user.active && (
                            <span className="text-[8px] uppercase px-1.5 py-0.5 bg-red-500/20 text-red-500 font-black rounded border border-red-500/30">Inactif</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">{user.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Role selector (except self) */}
                      {user.id !== currentUser?.id ? (
                        <select
                          value={user.role}
                          onChange={e => handleChangeRole(user.id, e.target.value as AppUser['role'])}
                          className="bg-secondary/60 border border-border/40 rounded-lg px-2 py-1 text-[10px] font-bold focus:outline-none focus:border-primary/50"
                        >
                          <option value="viewer">👁️ Observateur</option>
                          <option value="operator">✏️ Opérateur</option>
                          <option value="admin">⚙️ Admin</option>
                        </select>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 bg-primary/10 text-primary rounded-lg border border-primary/20">⚙️ Mon compte</span>
                      )}

                      {/* Password reset button */}
                      <button
                        onClick={() => setChangingPasswordFor(changingPasswordFor === user.id ? null : user.id)}
                        className={`p-1.5 rounded-lg transition-all ${
                          changingPasswordFor === user.id 
                            ? 'bg-primary text-primary-foreground' 
                            : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                        }`}
                        title="Changer mot de passe"
                      >
                        <Key className="h-3.5 w-3.5" />
                      </button>

                      {/* Active toggle (except self) */}
                      <button
                        onClick={() => handleToggleActive(user.id)}
                        className={`p-1.5 rounded-lg transition-all ${
                          user.id === currentUser?.id ? 'opacity-20 cursor-not-allowed' :
                          user.active 
                            ? 'text-emerald-400 hover:bg-emerald-500/10' 
                            : 'text-red-400 hover:bg-red-500/10'
                        }`}
                        title={user.active ? 'Désactiver' : 'Activer'}>
                        {user.active 
                          ? <UserCheck className="h-3.5 w-3.5" />
                          : <UserX className="h-3.5 w-3.5" />
                        }
                      </button>
                      
                      {/* Delete (except self) */}
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Supprimer l'utilisateur"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline password change form */}
                  {changingPasswordFor === user.id && (
                    <div className="mt-3 flex items-center gap-2 p-2 bg-background/40 rounded-lg border border-border/20 animate-in fade-in slide-in-from-top-1 duration-200">
                      <input
                        type="password"
                        value={newPassInput}
                        onChange={e => setNewPassInput(e.target.value)}
                        placeholder="Nouveau mot de passe"
                        className="flex-1 bg-secondary/50 border border-border/60 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary/50"
                        autoFocus
                      />
                      <button
                        onClick={() => handleChangePassword(user.id)}
                        disabled={!newPassInput || newPassInput.length < 4}
                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold disabled:opacity-40 hover:bg-primary/90 transition-all"
                      >
                        Confirmer
                      </button>
                      <button
                        onClick={() => { setChangingPasswordFor(null); setNewPassInput('') }}
                        className="px-2 py-1.5 rounded-lg border border-border/60 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Add new user form */}
            <div className="px-4 pb-5">
              <div className="bg-secondary/40 border border-dashed border-border/60 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Plus className="h-3.5 w-3.5 text-primary" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Nouvel utilisateur
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div className="space-y-1">
                    <input
                      value={newUserName}
                      onChange={e => setNewUserName(e.target.value)}
                      placeholder="Nom complet"
                      className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <input
                      value={newUserEmail}
                      onChange={e => setNewUserEmail(e.target.value)}
                      placeholder="Email"
                      type="email"
                      className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-all"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div className="space-y-1">
                    <input
                      value={newUserPassword}
                      onChange={e => setNewUserPassword(e.target.value)}
                      placeholder="Mot de passe"
                      type="password"
                      className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <select
                      value={newUserRole}
                      onChange={e => setNewUserRole(e.target.value as AppUser['role'])}
                      className="w-full bg-background/50 border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 appearance-none transition-all"
                    >
                      <option value="viewer">👁️ Observateur (Lecture seule)</option>
                      <option value="operator">✏️ Opérateur (Saisie manuelle)</option>
                      <option value="admin">⚙️ Administrateur (Plein accès)</option>
                    </select>
                  </div>
                </div>
                
                <button
                  onClick={handleAddUser}
                  disabled={!newUserName || !newUserEmail || !newUserPassword}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/20 disabled:opacity-30 disabled:shadow-none"
                >
                  Ajouter l'utilisateur
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <CacheStatus open={showCacheStatus} onClose={() => setShowCacheStatus(false)} />
    </div>
  )
}
