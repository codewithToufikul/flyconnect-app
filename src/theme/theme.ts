export interface ThemeColors {
  mode: 'light' | 'dark';
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  white: string;
  gradient: string[];
  glass: string;
  chatBubbleSender: string;
  chatBubbleSenderText: string;
  chatBubbleReceiver: string;
  chatBubbleReceiverText: string;
  headerBackground: string;
}

export const LightTheme: ThemeColors = {
  mode: 'light',
  primary: '#3843D0',
  secondary: '#00D5A3',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1E293B',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  error: '#EF4444',
  success: '#10B981',
  white: '#FFFFFF',
  gradient: ['#3843D0', '#00D5A3'],
  glass: 'rgba(255, 255, 255, 0.8)',
  chatBubbleSender: '#3843D0',
  chatBubbleSenderText: '#FFFFFF',
  chatBubbleReceiver: '#F1F5F9',
  chatBubbleReceiverText: '#1E293B',
  headerBackground: '#FFFFFF',
};

export const DarkTheme: ThemeColors = {
  mode: 'dark',
  primary: '#6366F1',
  secondary: '#10B981',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#334155',
  error: '#EF4444',
  success: '#10B981',
  white: '#FFFFFF',
  gradient: ['#6366F1', '#10B981'],
  glass: 'rgba(30, 41, 59, 0.8)',
  chatBubbleSender: '#6366F1',
  chatBubbleSenderText: '#FFFFFF',
  chatBubbleReceiver: '#334155',
  chatBubbleReceiverText: '#F8FAFC',
  headerBackground: '#1E293B',
};

export const Colors = LightTheme;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Shadows = {
  default: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  primary: {
    shadowColor: '#2563EB',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
};
