import { useColorScheme } from 'react-native';

const light = {
  bg: '#F7F5F2',
  card: '#FFFFFF',
  text: '#1F1D1A',
  sub: '#7A746C',
  line: '#E6E1DA',
  accent: '#D9663B',
  accentText: '#FFFFFF',
  chip: '#EFEAE3',
};

const dark: typeof light = {
  bg: '#141311',
  card: '#1E1C1A',
  text: '#F2EEE8',
  sub: '#A39C92',
  line: '#2E2B27',
  accent: '#E9825A',
  accentText: '#1A120D',
  chip: '#2A2724',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
