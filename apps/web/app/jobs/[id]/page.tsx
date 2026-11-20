import JobView from "../../components/JobView";
import SiteNav from "../../components/SiteNav";

/**
 * Clean shareable job URL: /jobs/<id>. Same JobView as the home page's
 * ?job=<id> deep link, so both URLs show the same job.
 */
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          COVEN · JOB {id}
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
          The <span className="text-[#f5c518]">Coven</span> at Work
        </h1>
        <JobView jobId={id} />
        <footer className="mt-10 text-sm text-[#9a9ab0]">
          Settled + reserved + unresolved = approved budget. Always.
        </footer>
      </main>
    </>
  );
}
