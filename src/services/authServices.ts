import {post, saveToken, saveUserCache, clearAuth} from './api';

/**
 * Authentication API Services for FlyConnect
 * This follows the professional structure used in the FlyBook App
 */

export interface LoginCredentials {
  number: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: any;
  message?: string;
}

/**
 * Standard login with number + password
 * Matches the Express backend AuthRoutes.login
 */
export const login = async (
  credentials: LoginCredentials,
): Promise<AuthResponse> => {
  try {
    const response = await post<AuthResponse>(
      '/api/v1/auth/login',
      credentials,
    );

    if (response.success && response.token) {
      await saveToken(response.token);
      if (response.user) {
        await saveUserCache(response.user);
      }
    }

    return response;
  } catch (error: any) {
    console.error('Login service error:', error);
    throw {
      success: false,
      message: error.message || 'Login failed. Please try again.',
    };
  }
};

/**
 * SSO Login with FlyBook
 *
 * Sends the FlyBook JWT token (received via deep link) to the FlyConnect backend.
 * The backend verifies it with the FlyBook server and returns a proper FlyConnect JWT.
 *
 * This is the CRITICAL missing piece: the app was previously saving the FlyBook
 * token directly, meaning FlyConnect API calls would fail authentication.
 * Now we properly exchange it for a FlyConnect-specific token.
 *
 * @param flybookToken - The JWT token received from FlyBook via deep link callback
 */
export const loginWithFlyBook = async (
  flybookToken: string,
): Promise<AuthResponse> => {
  try {
    console.log('🔐 [SSO] Exchanging FlyBook token for FlyConnect token...');

    const response = await post<AuthResponse>(
      '/api/v1/auth/login-with-flybook',
      {token: flybookToken},
    );

    if (response.success && response.token) {
      // Save the FlyConnect token (NOT the raw FlyBook token)
      await saveToken(response.token);
      if (response.user) {
        await saveUserCache(response.user);
      }
      console.log('✅ [SSO] FlyConnect token saved for:', response.user?.name);
    }

    return response;
  } catch (error: any) {
    console.error('❌ [SSO] Token exchange failed:', error);
    throw {
      success: false,
      message:
        error.message ||
        'SSO Login failed. Please try again or login manually.',
    };
  }
};

/**
 * User logout
 */
export const logout = async (): Promise<void> => {
  try {
    await clearAuth();
  } catch (error) {
    console.error('Logout error:', error);
    await clearAuth();
  }
};
