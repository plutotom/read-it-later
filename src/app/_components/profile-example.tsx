"use client";

import { api } from "@/trpc/react";

type Profile = {
  id: string;
  userId: string;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  linkedin?: string | null;
  github?: string | null;
  twitter?: string | null;
  phone?: string | null;
  resumeUrl?: string | null;
  skills?: string[] | null;
  experience?: string[] | null;
  education?: string[] | null;
  createdAt: Date;
  updatedAt: Date | null;
};

export function ProfileExample() {
  const { data: profile, isLoading } = api.profile.getCurrent.useQuery();
  const createProfile = api.profile.create.useMutation();
  const updateProfile = api.profile.update.useMutation();

  const handleCreateProfile = async () => {
    try {
      await createProfile.mutateAsync({
        bio: "Software developer passionate about building great products",
        location: "San Francisco, CA",
        website: "https://example.com",
        github: "https://github.com/example",
        linkedin: "https://linkedin.com/in/example",
        skills: ["TypeScript", "React", "Next.js", "Node.js"],
      });
    } catch (error) {
      console.error("Failed to create profile:", error);
    }
  };

  const handleUpdateProfile = async () => {
    if (!profile) return;

    try {
      await updateProfile.mutateAsync({
        bio: "Updated bio: Senior software developer with 5+ years experience",
        skills: ["TypeScript", "React", "Next.js", "Node.js", "Python", "AWS"],
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };

  if (isLoading) return <div>Loading profile...</div>;

  const profileData = profile as Profile | null;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-4 text-2xl font-bold">Profile Example</h2>

      {profileData ? (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Bio:</h3>
            <p className="text-gray-600">{profileData.bio || "No bio set"}</p>
          </div>

          <div>
            <h3 className="font-semibold">Location:</h3>
            <p className="text-gray-600">
              {profileData.location || "No location set"}
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Skills:</h3>
            <div className="flex flex-wrap gap-2">
              {profileData.skills?.map((skill: string, index: number) => (
                <span
                  key={index}
                  className="rounded bg-blue-100 px-2 py-1 text-sm text-blue-800"
                >
                  {skill}
                </span>
              )) || <span className="text-gray-500">No skills set</span>}
            </div>
          </div>

          <div>
            <h3 className="font-semibold">Links:</h3>
            <div className="space-y-1">
              {profileData.website && (
                <a
                  href={profileData.website}
                  className="block text-blue-600 hover:underline"
                >
                  Website
                </a>
              )}
              {profileData.github && (
                <a
                  href={profileData.github}
                  className="block text-blue-600 hover:underline"
                >
                  GitHub
                </a>
              )}
              {profileData.linkedin && (
                <a
                  href={profileData.linkedin}
                  className="block text-blue-600 hover:underline"
                >
                  LinkedIn
                </a>
              )}
            </div>
          </div>

          <button
            onClick={handleUpdateProfile}
            className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? "Updating..." : "Update Profile"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-gray-600">
            No profile found. Create one to get started!
          </p>
          <button
            onClick={handleCreateProfile}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            disabled={createProfile.isPending}
          >
            {createProfile.isPending ? "Creating..." : "Create Profile"}
          </button>
        </div>
      )}
    </div>
  );
}
