import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/lib/env';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(env.demoMode ? 'alex@tricoat.local' : '');
  const [password, setPassword] = useState(env.demoMode ? 'demo' : '');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-200 p-6">
      <Card className="w-full max-w-sm platinum-surface">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-md bg-gradient-to-br from-zinc-400 to-zinc-700 shadow-inner" />
          <CardTitle className="text-xl tracking-wide">Tricoat · PM</CardTitle>
          <CardDescription>
            {env.demoMode ? 'Demo mode — tap Sign in to explore' : 'Sign in to continue'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          {env.demoMode && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Running with in-memory fixtures. No server required.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
