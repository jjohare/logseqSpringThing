import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import useAuth from '../lib/hooks/useAuth';
const NostrAuthSection = () => {
    const { authenticated, user, authError, login, logout } = useAuth();
    return (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Nostr Authentication" }), _jsx(CardDescription, { children: "Authenticate with your Nostr key to unlock advanced features." })] }), _jsx(CardContent, { className: "flex flex-col space-y-2", children: authenticated ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("span", { children: "Logged in as:" }), _jsxs("span", { children: [user?.pubkey.slice(0, 8), "...", user?.pubkey.slice(-8)] })] }), _jsxs("div", { children: [_jsx("span", { children: "Role:" }), _jsx("span", { children: user?.isPowerUser ? 'Power User' : 'Authenticated User' })] }), _jsx(Button, { variant: "destructive", onClick: logout, children: "Logout" })] })) : (_jsxs(_Fragment, { children: [_jsx(Button, { onClick: login, children: "Login with Nostr" }), authError && _jsx("div", { className: "text-red-500", children: authError })] })) })] }));
};
export default NostrAuthSection;
