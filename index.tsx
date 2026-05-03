import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import App from './App';

// Keep the native launch splash visible until App paints the first in-app splash frame (APK / store builds).
void SplashScreen.preventAutoHideAsync();

registerRootComponent(App);
