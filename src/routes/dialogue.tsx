import { createFileRoute } from "@tanstack/react-router";
import { ProductPage, productHead } from "@/components/suite/ProductPage";
import { suiteBySlug } from "@/config/brand";

const product = suiteBySlug.dialogue;

export const Route = createFileRoute("/dialogue")({
  head: () => productHead(product),
  component: DialoguePage,
});

function DialoguePage() {
  return (
    <ProductPage
      product={product}
      action={<p className="font-serif text-lg italic text-foreground/70">This is coming.</p>}
    />
  );
}