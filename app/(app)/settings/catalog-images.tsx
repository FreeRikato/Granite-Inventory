"use client";

import { useRef, useTransition } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProductPhoto } from "@/components/catalog/stone-tile";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { newProductImagePath, PRODUCT_IMAGE_BUCKET } from "@/lib/product-images";
import { useAfterWrite } from "@/lib/query/provider";
import { shrinkImage } from "@/lib/shrink-image";
import { createClient } from "@/lib/supabase/client";
import { removeProductImageAction, setProductImageAction } from "./actions";

type Product = {
  readonly id: string;
  readonly name: string;
  readonly archived_at: string | null;
  readonly image_path: string | null;
};

export function CatalogImages({ products }: { readonly products: readonly Product[] }) {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="text-base font-bold">Catalog images</h2>
      <p className="text-sm text-muted-foreground">
        One picture per Product, shown on every size of it in the Public Catalog. Products without one keep the colour
        swatch.
      </p>
      {products.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">None yet.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {products.map((p) => (
            <ImageTile key={p.id} product={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ImageTile({ product }: { readonly product: Product }) {
  const afterWrite = useAfterWrite();
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const hasImage = Boolean(product.image_path);

  function pick(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      let shrunk;
      try {
        shrunk = await shrinkImage(file);
      } catch {
        toast.error("That file is not a photo. Pick a JPG, PNG or WebP image.");
        return;
      }
      const path = newProductImagePath(product.id, shrunk.extension);
      const uploaded = await createClient()
        .storage.from(PRODUCT_IMAGE_BUCKET)
        .upload(path, shrunk.blob, { contentType: shrunk.blob.type, cacheControl: "31536000" });
      if (uploaded.error) {
        toast.error(uploaded.error.message);
        return;
      }
      const result = await setProductImageAction({ productId: product.id, path });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Image saved");
      afterWrite("settings-product-image");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeProductImageAction(product.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Image removed");
      afterWrite("settings-product-image");
    });
  }

  return (
    <li data-testid="catalog-image-tile">
      <div className="relative">
        <ProductPhoto name={product.name} imagePath={product.image_path} className="aspect-[3/2]" />
        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-tile bg-background/60">
            <Spinner />
          </span>
        ) : null}
      </div>
      <div className="mt-2 truncate text-sm font-medium">{product.name}</div>
      <div className="text-xs text-muted-foreground">
        {hasImage ? "Image set" : "Colour swatch"}
        {product.archived_at ? " · Archived" : ""}
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label={`Image file for ${product.name}`}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => input.current?.click()}
          aria-label={`${hasImage ? "Replace" : "Upload"} image for ${product.name}`}
        >
          <ImageUp className="size-4" /> {hasImage ? "Replace" : "Upload"}
        </Button>
        {hasImage ? (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={pending}
            onClick={remove}
            aria-label={`Remove image for ${product.name}`}
            className="text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}
