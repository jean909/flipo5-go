import ShareView from './ShareView';

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  return <ShareView token={decoded} />;
}
