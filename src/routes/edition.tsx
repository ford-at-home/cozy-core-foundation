import { createFileRoute } from "@tanstack/react-router";
import { ProductPage, productHead } from "@/components/suite/ProductPage";
import { suiteBySlug } from "@/config/brand";

const product = suiteBySlug.edition;

export const Route = createFileRoute("/edition")({
  head: () => productHead(product),
  component: EditionPage,
});

function EditionPage() {
  return (
    <ProductPage
      product={product}
      action={
        <p className="font-serif text-lg italic text-foreground/80">
          Now in private beta. Ask below to be included.
        </p>
      }
    />
  );
}