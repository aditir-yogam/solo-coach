import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import SignUp from './pages/SignUp';
import CheckEmail from './pages/CheckEmail';
import SignInError from './pages/SignInError';
import Personalize from './pages/Personalize';
import Portfolio from './pages/Portfolio';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';

// "/" keeps any ?org=<code> when forwarding to the sign-up URL (/join).
function ToJoin() {
  const { search } = useLocation();
  return <Navigate to={`/join${search}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/join" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/check-email" element={<CheckEmail />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/signin/error" element={<SignInError />} />
      <Route path="/personalize" element={<Personalize />} />
      <Route path="/portfolio" element={<Portfolio />} />
      <Route path="*" element={<ToJoin />} />
    </Routes>
  );
}
