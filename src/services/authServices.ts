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
 * User login
 * This matches your Express backend (AuthRoutes.login)
 */
export const login = async (
  credentials: LoginCredentials,
): Promise<AuthResponse> => {
  try {
    const response = await post<AuthResponse>(
      '/api/v1/auth/login',
      credentials,
    );

    // Save token and user data if login successful
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
 * User logout
 */
export const logout = async (): Promise<void> => {
  try {
    await clearAuth();
    // Use navigation to reset stack (to be handled in UI)
  } catch (error) {
    console.error('Logout error:', error);
    await clearAuth();
  }
};
