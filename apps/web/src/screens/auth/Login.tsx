import { useSearchParams } from 'react-router';
import { AdminLogin } from './AdminLogin';
import { LearnerPicker } from './LearnerPicker';

/** /login — the learner flow by default, the parent's form with `?as=admin`. */
export function Login() {
  const [params] = useSearchParams();
  return params.get('as') === 'admin' ? <AdminLogin /> : <LearnerPicker />;
}
