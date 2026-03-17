import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export function navigate(name: string, params: any): boolean {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
    return true;
  }
  return false;
}

export function goBack() {
  if (navigationRef.isReady()) {
    if (navigationRef.canGoBack()) {
      navigationRef.goBack();
    } else {
      // Fallback: if we can't go back, go to Main/Home
      navigationRef.navigate('Main' as any);
    }
  }
}
