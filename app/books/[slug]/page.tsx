import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getBookBySlug } from "@/lib/actions/book.actions";
import VapiControls from "@/components/VapiControls";

export default async function BookDetailsPage({
  params,
}: {
  params: { slug: string };
}) {
  // Check authentication
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { slug } = params;

  // Fetch book safely
  let result;
  try {
    result = await getBookBySlug(slug);
  } catch (error) {
    console.error("Error fetching book:", error);
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg">Loading book...</p>
      </div>
    );
  }

  // 🔥 IMPORTANT CHANGE HERE
  if (!result?.success || !result?.data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg">Loading book...</p>
      </div>
    );
  }

  const book = result.data;

  return (
    <div className="book-page-container">
      <Link href="/" className="back-btn-floating">
        <ArrowLeft className="size-6 text-[#212a3b]" />
      </Link>

      <VapiControls book={book} />
    </div>
  );
}