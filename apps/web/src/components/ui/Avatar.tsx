import { clsx } from 'clsx';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  className?: string;
}

const sizes = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-sm',
  md: 'w-11 h-11 text-base',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl',
};

const indicatorSizes = {
  xs: 'w-2 h-2 -bottom-0.5 -right-0.5',
  sm: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
  md: 'w-3 h-3 bottom-0 right-0',
  lg: 'w-3.5 h-3.5 bottom-0.5 right-0.5',
  xl: 'w-4 h-4 bottom-0.5 right-0.5',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

// Deterministic color from name
function getColor(name: string): string {
  const colors = [
    'bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-yellow-400',
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500',
  ];
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length] ?? 'bg-gray-400';
}

export function Avatar({ src, name, size = 'md', isOnline, className }: AvatarProps) {
  return (
    <div className={clsx('relative flex-shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={clsx('rounded-full object-cover', sizes[size])}
        />
      ) : (
        <div
          className={clsx(
            'rounded-full flex items-center justify-center font-semibold text-white',
            sizes[size],
            getColor(name),
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {isOnline !== undefined && (
        <span
          className={clsx(
            'absolute rounded-full border-2 border-white dark:border-gray-800',
            indicatorSizes[size],
            isOnline ? 'bg-green-500' : 'bg-gray-400',
          )}
        />
      )}
    </div>
  );
}
