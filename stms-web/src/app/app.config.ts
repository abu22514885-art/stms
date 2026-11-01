import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import {
  lucideBoxes,
  lucideBellRing,
  lucideChartNoAxesCombined,
  lucideEye,
  lucideEyeOff,
  lucideHandCoins,
  lucideLayoutDashboard,
  lucideLogOut,
  lucideMenu,
  lucidePackage,
  lucideReceiptText,
  lucideSettings,
  lucideShoppingCart,
  lucideUsers,
} from '@ng-icons/lucide';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideIcons({
      lucideBoxes,
      lucideBellRing,
      lucideChartNoAxesCombined,
      lucideEye,
      lucideEyeOff,
      lucideHandCoins,
      lucideLayoutDashboard,
      lucideLogOut,
      lucideMenu,
      lucidePackage,
      lucideReceiptText,
      lucideSettings,
      lucideShoppingCart,
      lucideUsers,
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
