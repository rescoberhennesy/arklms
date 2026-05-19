// src/lib/actions/profile.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/user';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Fetch the current user's full profile row.
 */
export async function getMyProfile(): Promise<ActionResult<Profile>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single<Profile>();

    if (error) throw error;
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to load profile' };
  }
}

interface UpdateProfileInput {
  full_name: string;
  username: string | null;
}

/**
 * Update the editable text fields on the current user's profile.
 * email / role / institution are NOT editable here — role is set by
 * an admin, email comes from the identity provider.
 */
export async function updateMyProfile(
  input: UpdateProfileInput,
): Promise<ActionResult<Profile>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const fullName = input.full_name.trim();
    if (!fullName) {
      return { ok: false, error: 'Name cannot be empty' };
    }
    if (fullName.length > 120) {
      return { ok: false, error: 'Name is too long (max 120 characters)' };
    }

    const username = input.username?.trim() || null;
    if (username && username.length > 40) {
      return { ok: false, error: 'Username is too long (max 40 characters)' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, username })
      .eq('id', user.id)
      .select('*')
      .single<Profile>();

    if (error) throw error;

    revalidatePath('/profile');
    revalidatePath('/', 'layout'); // refresh the dashboard layout (navbar name)
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to update profile' };
  }
}

/**
 * Map a file extension to a proper image MIME type.
 * We derive the content type ourselves rather than trusting File.type,
 * which can arrive empty when a File is passed through FormData into a
 * server action. An empty/wrong content type makes Supabase Storage
 * serve the object as application/json, which the browser's Opaque
 * Response Blocking then refuses to render in an <img> tag.
 */
function contentTypeForExt(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

/**
 * Upload (or replace) the current user's avatar.
 * Accepts a FormData with a `file` field — called from the client form.
 *
 * Path: avatars/<user_id>/avatar-<timestamp>.<ext>
 * We include a timestamp so the public URL changes on every upload,
 * busting any browser/CDN cache of the old image.
 */
export async function uploadMyAvatar(
  formData: FormData,
): Promise<ActionResult<{ avatar_url: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'No file provided' };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { ok: false, error: 'Image is too large (max 2 MB)' };
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return { ok: false, error: 'Use a JPEG, PNG, or WebP image' };
    }

    const ext =
      file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
        ? 'webp'
        : 'jpg';

    // Derive the MIME type ourselves — do NOT rely on file.type for the
    // upload, it can be lost in transit and corrupt the stored object's
    // content type.
    const contentType = contentTypeForExt(ext);
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;

    // Convert the File to a Buffer so the upload carries our explicit
    // content type and does not depend on the File's own metadata.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, {
        upsert: true,
        contentType,
        cacheControl: '3600',
      });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(path);

    const { data: updatedRows, error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id)
      .select('id');

    if (updateError) throw updateError;
    if (!updatedRows || updatedRows.length === 0) {
      return {
        ok: false,
        error:
          'Avatar uploaded but the profile row did not update (0 rows affected). This is an RLS policy blocking the UPDATE.',
      };
    }

    revalidatePath('/profile');
    revalidatePath('/', 'layout'); // refresh the dashboard layout (navbar avatar)
    return { ok: true, data: { avatar_url: publicUrl } };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to upload avatar' };
  }
}