import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

const MEDIA_BUCKET = 'public-media';

export type SiteContentKind = 'photo' | 'video' | 'quote';

export interface SiteContent {
  id: string;
  kind: SiteContentKind;
  title: string;
  description: string | null;
  quote: string | null;
  media_url: string | null;
  media_path: string | null;
  published: boolean;
  home_featured: boolean;
  created_at: string;
}

export interface BucketVideo {
  path: string;
  name: string;
  created_at: string | null;
  size: number | null;
}

export interface DonationPayment {
  payment_id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  donor_email: string | null;
  category: string | null;
  paid_at: string;
}

export interface HomeBelief {
  eyebrow: string;
  heading: string;
  body: string;
  link_label: string;
  link_url: string;
}

export interface FounderPhoto {
  path: string;
  url: string;
}

export interface HomeFounders {
  message: string;
  name: string;
  photos: FounderPhoto[];
}

export const DEFAULT_HOME_FOUNDERS: HomeFounders = {
  message: '',
  name: '',
  photos: [],
};

export const DEFAULT_HOME_BELIEF: HomeBelief = {
  eyebrow: 'Our belief',
  heading: 'People closest to the challenge belong at the heart of the solution.',
  body: 'We listen first, then work side by side — because lasting progress is strongest when communities shape the decisions, priorities, and actions that affect their lives.',
  link_label: 'Learn about our approach',
  link_url: '/about',
};

export function normalizeDonationPayment(payment: DonationPayment): DonationPayment {
  const legacySuccess = payment.status.toLowerCase() === 'success';
  const captured = legacySuccess || payment.status.toLowerCase() === 'captured';

  return {
    ...payment,
    amount: legacySuccess ? payment.amount * 100 : payment.amount,
    status: captured ? 'captured' : payment.status,
  };
}

export function isMissingStorageObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const details = error as Record<string, unknown>;
  const statusCode = String(details['statusCode']);
  return (
    details['code'] === 'NoSuchKey' ||
    ((statusCode === '400' || statusCode === '404') &&
      typeof details['message'] === 'string' &&
      details['message'].toLowerCase().includes('object not found'))
  );
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private clientInstance?: SupabaseClient;

  get isConfigured(): boolean {
    return (
      environment.supabaseUrl.startsWith('https://') &&
      !environment.supabaseUrl.includes('YOUR_SUPABASE') &&
      Boolean(environment.supabaseKey) &&
      !environment.supabaseKey.includes('YOUR_SUPABASE')
    );
  }

  private get client(): SupabaseClient {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Supabase requests are available only in the browser.');
    }
    if (!this.isConfigured) {
      throw new Error('Supabase is not configured. Set the project URL and publishable key.');
    }

    const projectUrl = environment.supabaseUrl.replace(/\/rest\/v1\/?$/, '');
    this.clientInstance ??= createClient(projectUrl, environment.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    });
    return this.clientInstance;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await this.requireAdminSession();
  }

  async restoreAdminSession(): Promise<boolean> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!data.session) return false;

    await this.requireAdminSession();
    return true;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  private async isAdmin(): Promise<boolean> {
    const { data, error } = await this.client.rpc('is_site_admin');
    if (error) throw error;
    return data === true;
  }

  private async requireAdminSession(): Promise<void> {
    try {
      if (!(await this.isAdmin())) {
        throw new Error('This account is not authorized to access the admin dashboard.');
      }
    } catch (error) {
      const { error: signOutError } = await this.client.auth.signOut();
      if (signOutError) {
        throw new Error('Admin access was denied, and the session could not be cleared.');
      }
      throw error;
    }
  }

  async getPayments(): Promise<DonationPayment[]> {
    const { data, error } = await this.client
      .from('donation_payments')
      .select('payment_id, order_id, amount, currency, status, method, donor_email, category, paid_at')
      .order('paid_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data as DonationPayment[]).map(normalizeDonationPayment);
  }

  async getHomeBelief(): Promise<HomeBelief> {
    const { data, error } = await this.client
      .from('home_belief')
      .select('eyebrow, heading, body, link_label, link_url')
      .eq('id', 'home')
      .single();
    if (error) throw error;
    return data as HomeBelief;
  }

  async getHomeFounders(): Promise<HomeFounders> {
    const { data, error } = await this.client
      .from('home_founders')
      .select('message, founder_name, photo_paths')
      .eq('id', 'home')
      .single();
    if (error) throw error;

    const record = data as { message: string; founder_name: string; photo_paths: string[] };
    const photos = await Promise.all(
      record.photo_paths.map(async (path): Promise<FounderPhoto | null> => {
        const { data: signed, error: storageError } = await this.client.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(path, 3600);
        if (storageError) {
          if (isMissingStorageObject(storageError)) return null;
          throw storageError;
        }
        return { path, url: signed.signedUrl };
      }),
    );
    return {
      message: record.message,
      name: record.founder_name,
      photos: photos.filter((photo): photo is FounderPhoto => photo !== null),
    };
  }

  async updateHomeFounders(input: {
    message: string;
    name: string;
    files: File[];
    removePhotos: boolean;
  }): Promise<HomeFounders> {
    if (input.files.length > 4) throw new Error('Choose no more than four founder photos.');
    const { data: current, error: readError } = await this.client
      .from('home_founders')
      .select('photo_paths')
      .eq('id', 'home')
      .single();
    if (readError) throw readError;

    const previousPaths = (current.photo_paths as string[]) ?? [];
    const uploadedPaths: string[] = [];
    let saved = false;
    try {
      for (const file of input.files) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension) throw new Error('Choose a founder photo with a valid file extension.');
        const path = `founders/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await this.client.storage
          .from(MEDIA_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
      }

      const photoPaths = [
        ...(input.removePhotos ? [] : previousPaths),
        ...uploadedPaths,
      ];
      if (photoPaths.length > 4) {
        throw new Error('The Home founder gallery can contain no more than four photos.');
      }
      const { error: updateError } = await this.client
        .from('home_founders')
        .update({
          message: input.message.trim(),
          founder_name: input.name.trim(),
          photo_paths: photoPaths,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'home');
      if (updateError) throw updateError;
      saved = true;

      const pathsToRemove = previousPaths.filter((path) => !photoPaths.includes(path));
      if (pathsToRemove.length) {
        const { error: cleanupError } = await this.client.storage
          .from(MEDIA_BUCKET)
          .remove(pathsToRemove);
        if (cleanupError) {
          console.error('Founder content was saved, but old founder photos could not be removed.', cleanupError);
        }
      }
      return this.getHomeFounders();
    } catch (error) {
      if (uploadedPaths.length && !saved) {
        const { error: cleanupError } = await this.client.storage
          .from(MEDIA_BUCKET)
          .remove(uploadedPaths);
        if (cleanupError) {
          console.error('Unable to remove uploaded founder photos after the save failed.', cleanupError);
        }
      }
      throw error;
    }
  }

  async getHomeVideoUrl(): Promise<string | null> {
    const { data, error } = await this.client
      .from('site_content')
      .select('media_path')
      .eq('kind', 'video')
      .eq('published', true)
      .eq('home_featured', true)
      .not('media_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.media_path) return null;

    return this.getPublicMediaUrl(data.media_path);
  }

  async setHomeFeaturedVideo(contentId: string | null): Promise<string | null> {
    const { error } = await this.client.rpc('set_home_featured_video', {
      p_content_id: contentId,
    });
    if (error) throw error;
    return this.getHomeVideoUrl();
  }

  async updateHomeBelief(belief: HomeBelief): Promise<HomeBelief> {
    const { data, error } = await this.client
      .from('home_belief')
      .update({
        eyebrow: belief.eyebrow.trim(),
        heading: belief.heading.trim(),
        body: belief.body.trim(),
        link_label: belief.link_label.trim(),
        link_url: belief.link_url.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'home')
      .select('eyebrow, heading, body, link_label, link_url')
      .single();
    if (error) throw error;
    return data as HomeBelief;
  }

  async getPublishedContent(): Promise<SiteContent[]> {
    const { data, error } = await this.client
      .from('site_content')
      .select('id, kind, title, description, quote, media_path, published, home_featured, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return this.addSignedMediaUrls(data as SiteContent[]);
  }

  async getAllContent(): Promise<SiteContent[]> {
    const { data, error } = await this.client
      .from('site_content')
      .select('id, kind, title, description, quote, media_path, published, home_featured, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return this.addSignedMediaUrls(data as SiteContent[]);
  }

  async getAvailableBucketVideos(): Promise<BucketVideo[]> {
    const { data: linkedItems, error: linkedError } = await this.client
      .from('site_content')
      .select('media_path')
      .not('media_path', 'is', null);
    if (linkedError) throw linkedError;
    const linkedPaths = new Set(
      (linkedItems as Array<{ media_path: string | null }>)
        .map((item) => item.media_path)
        .filter((path): path is string => path !== null),
    );

    const videos: BucketVideo[] = [];
    const pendingFolders = [''];
    while (pendingFolders.length > 0) {
      const folder = pendingFolders.pop();
      if (folder === undefined) continue;
      let offset = 0;
      const limit = 1000;

      while (true) {
        const { data, error } = await this.client.storage
          .from(MEDIA_BUCKET)
          .list(folder, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw error;

        for (const entry of data) {
          const path = folder ? `${folder}/${entry.name}` : entry.name;
          if (entry.id === null) {
            pendingFolders.push(path);
          } else if (
            /\.(mp4|webm)$/i.test(entry.name) &&
            !linkedPaths.has(path)
          ) {
            videos.push({
              path,
              name: entry.name,
              created_at: entry.created_at ?? null,
              size:
                typeof entry.metadata?.['size'] === 'number'
                  ? entry.metadata['size']
                  : null,
            });
          }
        }

        if (data.length < limit) break;
        offset += limit;
      }
    }

    return videos.sort((a, b) => a.name.localeCompare(b.name));
  }

  async importBucketVideo(path: string, title: string): Promise<string> {
    const normalizedPath = path.trim();
    const normalizedTitle = title.trim();
    if (!normalizedPath || !/\.(mp4|webm)$/i.test(normalizedPath)) {
      throw new Error('Choose an MP4 or WebM video from the media bucket.');
    }
    if (!normalizedTitle) throw new Error('Enter a title for this video.');

    const { data, error } = await this.client
      .from('site_content')
      .insert({
        kind: 'video',
        title: normalizedTitle,
        description: 'Imported from the public-media bucket.',
        media_path: normalizedPath,
        published: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  }

  private async addSignedMediaUrls(content: SiteContent[]): Promise<SiteContent[]> {
    return Promise.all(
      content.map(async (item) => {
        if (!item.media_path) return { ...item, media_url: null };
        if (item.published) {
          return { ...item, media_url: this.getPublicMediaUrl(item.media_path) };
        }
        const { data, error } = await this.client.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(item.media_path, 3600);
        if (error) {
          if (isMissingStorageObject(error)) return { ...item, media_url: null };
          throw error;
        }
        return { ...item, media_url: data.signedUrl };
      }),
    );
  }

  private getPublicMediaUrl(path: string): string {
    return this.client.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async addContent(input: {
    kind: SiteContentKind;
    title: string;
    description: string;
    quote: string;
    file?: File;
  }): Promise<void> {
    let mediaPath: string | null = null;

    if (input.file) {
      const extension = input.file.name.split('.').pop()?.toLowerCase();
      if (!extension) throw new Error('Choose a file with a valid extension.');
      mediaPath = `${crypto.randomUUID()}.${extension}`;

      const { error } = await this.client.storage
        .from(MEDIA_BUCKET)
        .upload(mediaPath, input.file, { contentType: input.file.type, upsert: false });
      if (error) throw error;
    }

    const { error } = await this.client.from('site_content').insert({
      kind: input.kind,
      title: input.title.trim(),
      description: input.description.trim() || null,
      quote: input.kind === 'quote' ? input.quote.trim() : null,
      media_path: mediaPath,
      published: false,
    });

    if (error) {
      if (mediaPath) {
        const { error: cleanupError } = await this.client.storage
          .from(MEDIA_BUCKET)
          .remove([mediaPath]);
        if (cleanupError) {
          console.error('Unable to remove uploaded media after content save failed.', cleanupError);
        }
      }
      throw error;
    }
  }

  async setContentPublished(id: string, published: boolean): Promise<void> {
    const { error } = await this.client
      .from('site_content')
      .update({ published })
      .eq('id', id);
    if (error) throw error;
  }

  async deleteContent(content: SiteContent): Promise<void> {
    const { error } = await this.client.from('site_content').delete().eq('id', content.id);
    if (error) throw error;

    if (content.media_path) {
      const { error: storageError } = await this.client.storage
        .from(MEDIA_BUCKET)
        .remove([content.media_path]);
      if (storageError) throw storageError;
    }
  }
}
