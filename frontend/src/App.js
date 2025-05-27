import './index.css';
import HomePage from './pages/HomePage';

export default function App({ colorScheme, toggleColorScheme }) {
  return <HomePage colorScheme={colorScheme} toggleColorScheme={toggleColorScheme} />;
}
