'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  User,
  Mail,
  Building,
  MapPin,
  Camera,
  Save,
  Trash2,
  Shield,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Profile() {
  const router = useRouter();
  const { toast } = useToast();

  const [profile, setProfile] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    company: 'Acme Corp',
    location: 'San Francisco, CA',
    bio: 'Infrastructure engineer managing cloud nodes.',
  });

  const handleSave = () => {
    toast({
    title: "Profile updated",
    description: "Your profile has been saved successfully.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
    {/* Background effects */}
    <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_50%)]" />

    <div className="relative z-10 container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/nodes')}>
            <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
            <h1 className="text-2xl font-bold text-foreground">Profile</h1>
            <p className="text-muted-foreground text-sm">Manage your personal information</p>
        </div>
        </div>

        <div className="space-y-6">
        {/* Avatar Section */}
        <div className="gradient-card border border-hairline rounded-xl p-6">
            <div className="flex items-center gap-6">
            <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <span className="text-3xl font-bold text-primary-foreground">
                    {profile.firstName[0]}{profile.lastName[0]}
                </span>
                </div>
                <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-secondary border border-hairline flex items-center justify-center hover:bg-secondary/80 transition-colors">
                <Camera className="w-4 h-4 text-muted-foreground" />
                </button>
            </div>
            <div>
                <h2 className="text-xl font-semibold text-foreground">
                {profile.firstName} {profile.lastName}
                </h2>
                <p className="text-muted-foreground">{profile.email}</p>
                <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
                    <Shield className="w-3 h-3" />
                    Pro Plan
                </span>
                <span className="text-xs text-muted-foreground">Member since Dec 2024</span>
                </div>
            </div>
            </div>
        </div>

        {/* Personal Information */}
        <div className="gradient-card border border-hairline rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h2 className="font-semibold text-foreground">Personal Information</h2>
                <p className="text-sm text-muted-foreground">Update your personal details</p>
            </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">First Name</label>
                <input
                type="text"
                value={profile.firstName}
                onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                className="w-full bg-secondary border border-hairline rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Last Name</label>
                <input
                type="text"
                value={profile.lastName}
                onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                className="w-full bg-secondary border border-hairline rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
            </div>
            </div>
        </div>

        {/* Contact Information */}
        <div className="gradient-card border border-hairline rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h2 className="font-semibold text-foreground">Contact Information</h2>
                <p className="text-sm text-muted-foreground">How we can reach you</p>
            </div>
            </div>

            <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email Address</label>
                <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full bg-secondary border border-hairline rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Building className="w-4 h-4" /> Company
                </label>
                <input
                    type="text"
                    value={profile.company}
                    onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                    className="w-full bg-secondary border border-hairline rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
                </div>
                <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Location
                </label>
                <input
                    type="text"
                    value={profile.location}
                    onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                    className="w-full bg-secondary border border-hairline rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
                </div>
            </div>
            </div>
        </div>

        {/* Bio */}
        <div className="gradient-card border border-hairline rounded-xl p-6">
            <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Bio</label>
            <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                rows={4}
                className="w-full bg-secondary border border-hairline rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                placeholder="Tell us about yourself..."
            />
            </div>
        </div>

        {/* Danger Zone */}
        <div className="border border-destructive/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
                <h2 className="font-semibold text-foreground">Danger Zone</h2>
                <p className="text-sm text-muted-foreground">Irreversible actions</p>
            </div>
            </div>

            <Button variant="outline" className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Account
            </Button>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
            <Button variant="glow" onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Profile
            </Button>
        </div>
        </div>
    </div>
    </div>
  );
}
