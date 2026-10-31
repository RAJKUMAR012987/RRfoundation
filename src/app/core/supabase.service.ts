import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

const MEDIA_BUCKET = 'my-new-bucket';

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
  created_at: string;
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

  async getHomeVideoUrl(): Promise<string | null> {
    const { data, error } = await this.client
      .from('site_content')
      .select('media_path')
      .eq('kind', 'video')
      .eq('published', true)
      .not('media_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.media_path) return null;

    const { data: signedUrl, error: storageError } = await this.client.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(data.media_path, 86400);
    if (storageError) throw storageError;
    return signedUrl.signedUrl;
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
      .select('id, kind, title, description, quote, media_path, published, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return this.addSignedMediaUrls(data as SiteContent[]);
  }

  async getAllContent(): Promise<SiteContent[]> {
    const { data, error } = await this.client
      .from('site_content')
      .select('id, kind, title, description, quote, media_path, published, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return this.addSignedMediaUrls(data as SiteContent[]);
  }

  private async addSignedMediaUrls(content: SiteContent[]): Promise<SiteContent[]> {
    return Promise.all(
      content.map(async (item) => {
        if (!item.media_path) return { ...item, media_url: null };
        const { data, error } = await this.client.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(item.media_path, 3600);
        if (error) throw error;
        return { ...item, media_url: data.signedUrl };
      }),
    );
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
