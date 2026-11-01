import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly swPush = inject(SwPush);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly subscribed = signal(false);
  readonly busy = signal(false);
  readonly feedback = signal('');

  get available(): boolean {
    return this.swPush.isEnabled && typeof Notification !== 'undefined';
  }

  constructor() {
    if (!this.swPush.isEnabled) return;
    this.swPush.subscription.subscribe(subscription => {
      this.subscribed.set(subscription !== null);
      if (subscription && this.auth.isLoggedIn()) void this.save(subscription);
    });
    this.swPush.notificationClicks.subscribe(({ notification }) => {
      const path = typeof notification.data?.['url'] === 'string' ? notification.data['url'] : '/dashboard';
      void this.router.navigateByUrl(path.startsWith('/') ? path : '/dashboard');
    });
  }

  async toggle(): Promise<void> {
    if (!this.available) {
      this.feedback.set('Push notifications require a production PWA build on HTTPS or localhost.');
      return;
    }
    this.feedback.set('');
    this.busy.set(true);
    try {
      if (this.subscribed()) {
        const subscription = await firstValueFrom(this.swPush.subscription);
        if (subscription) {
          const json = this.toRequest(subscription);
          await this.swPush.unsubscribe();
          if (this.auth.isLoggedIn()) await firstValueFrom(this.api.removePushSubscription(json));
        }
        this.subscribed.set(false);
        this.feedback.set('Push notifications are off on this device.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.feedback.set('Allow notifications in your browser settings to receive alerts.');
        return;
      }
      const { publicKey } = await firstValueFrom(this.api.vapidPublicKey());
      const subscription = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
      await this.save(subscription);
      this.subscribed.set(true);
      this.feedback.set('Push notifications are on for this device.');
    } catch (error) {
      this.feedback.set(error instanceof Error ? error.message : 'Could not update notification settings.');
    } finally {
      this.busy.set(false);
    }
  }

  private async save(subscription: PushSubscription): Promise<void> {
    const request = this.toRequest(subscription);
    await firstValueFrom(this.api.savePushSubscription(request));
  }

  private toRequest(subscription: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
    const json = subscription.toJSON();
    if (!json.keys?.['p256dh'] || !json.keys['auth'])
      throw new Error('The browser returned an incomplete push subscription.');
    return { endpoint: subscription.endpoint, p256dh: json.keys['p256dh'], auth: json.keys['auth'] };
  }
}