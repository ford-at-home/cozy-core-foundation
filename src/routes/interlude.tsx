import { createFileRoute } from "@tanstack/react-router";
import { ProductPage, productHead } from "@/components/suite/ProductPage";
import { suiteBySlug } from "@/config/brand";

const product = suiteBySlug.interlude;

export const Route = createFileRoute("/interlude")({
  head: () => productHead(product),
  component: InterludePage,
});

function InterludePage() {
  return (
    <ProductPage
      product={product}
      action={<p className="font-serif text-lg italic text-foreground/70">This is coming.</p>}
    />
  );
}