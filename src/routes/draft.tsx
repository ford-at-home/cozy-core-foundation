import { Link, createFileRoute } from "@tanstack/react-router";
import { ProductPage, productHead } from "@/components/suite/ProductPage";
import { suiteBySlug } from "@/config/brand";

const product = suiteBySlug.draft;

export const Route = createFileRoute("/draft")({
  head: () => productHead(product),
  component: DraftPage,
});

function DraftPage() {
  return (
    <ProductPage
      product={product}
      action={
        <Link
          to="/auth"
          className="inline-flex min-h-11 items-center justify-center border-b border-foreground/60 px-1 py-2 font-serif text-xl italic text-foreground transition-colors hover:border-foreground"
        >
          Enter Draft →
        </Link>
      }
    />
  );
}