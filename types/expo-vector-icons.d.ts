declare module '@expo/vector-icons' {
  import type { TextProps } from 'react-native';

  export const Ionicons: React.ComponentType<{
    name: string;
    size?: number;
    color?: string;
    style?: TextProps['style'];
  }>;
  export const MaterialCommunityIcons: React.ComponentType<{
    name: string;
    size?: number;
    color?: string;
    style?: TextProps['style'];
  }>;
  export const FontAwesome5: React.ComponentType<{
    name: string;
    size?: number;
    color?: string;
    style?: TextProps['style'];
  }>;
}
