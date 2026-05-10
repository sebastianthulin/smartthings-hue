import './styles/globals.scss';
import './components/app-shell.js';

const lockPortraitOrientation = async () => {
  try {
    await screen.orientation?.lock?.('portrait');
  } catch {
    // Ignore unsupported browsers and contexts where the lock is not allowed.
  }
};

lockPortraitOrientation();
