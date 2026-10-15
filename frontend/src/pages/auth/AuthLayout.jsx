import { LifeBuoy } from 'lucide-react';

/**
 * Split layout used by all public auth pages:
 * navy brand panel on the left (desktop), focused form on the right.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel */}
      <div className="relative hidden w-[42%] flex-col justify-between bg-brand-900 p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <LifeBuoy className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold text-white">ServiceDesk</p>
            <p className="text-xs text-brand-300">IT Service Requests</p>
          </div>
        </div>

        <div className="max-w-sm">
          <h2 className="text-2xl font-semibold leading-snug text-white">
            One place for every IT request.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-brand-200">
            Submit requests, track progress against SLA deadlines, and get notified at every
            step — from assignment to resolution.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-brand-200">
            {[
              'Automatic routing to the right support agent',
              'Clear SLA countdowns on every ticket',
              'Full history: comments, attachments, status changes',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-brand-400">Internal tool · IT Operations</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <LifeBuoy className="size-5" aria-hidden="true" />
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
