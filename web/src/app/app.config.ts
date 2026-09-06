import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import localeEsCo from '@angular/common/locales/es-CO';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor, errorInterceptor } from './core/http/interceptors';
import { MinerStockPreset } from './core/theme/minerstock.preset';
import { PRIMENG_ES } from './core/theme/primeng-es';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor])),
    providePrimeNG({
      theme: {
        preset: MinerStockPreset,
        options: {
          darkModeSelector: false,
          cssLayer: { name: 'primeng', order: 'theme, base, primeng' },
        },
      },
      ripple: false,
      translation: PRIMENG_ES,
    }),
    MessageService,
    ConfirmationService,
    { provide: LOCALE_ID, useValue: 'es-CO' },
    // Restaura la sesión (token guardado) antes de pintar rutas protegidas.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restore())),
  ],
};
