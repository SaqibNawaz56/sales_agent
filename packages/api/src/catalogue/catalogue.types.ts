/**
 * The shapes the MCP server returns.
 *
 * Declared here rather than imported from the server package on purpose: the
 * two are separate services that happen to share a repository, and the API
 * knowing the server's internal types would be a coupling the HTTP boundary is
 * supposed to prevent.
 */

export interface CatalogueProduct {
  id: number;
  name: string;
  unit: string;
  currentPrice: number;
}

export interface LookupProductResult {
  found: boolean;
  product?: CatalogueProduct;
  suggestions?: Array<{ id: number; name: string }>;
}

export interface FindCustomerResult {
  found: boolean;
  created: boolean;
  customer?: { id: number; name: string };
  suggestions?: Array<{ id: number; name: string }>;
}

export interface CreateProductResult {
  created: boolean;
  product?: CatalogueProduct;
}
