export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}
