import { createFileRoute } from "@tanstack/react-router";
import { ProductPage, productHead } from "@/components/suite/ProductPage";
import { suiteBySlug } from "@/config/brand";

const product = suiteBySlug.relic;

export const Route = createFileRoute("/relic")({
  head: () => productHead(product),
  component: RelicPage,
});

function RelicPage() {
  return (
    <ProductPage
      product={product}
      action={<p className="font-serif text-lg italic text-foreground/70">This is coming.</p>}
    />
  );
}