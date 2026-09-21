import type { NextRequest } from "next/server";
import type { CheckoutStartResponse } from "@/types/api";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createPolarClient } from "@/services/polar/client";

const GENERIC_ERROR_MESSAGE = "결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  try {
    const productId = process.env.POLAR_PRO_MONTHLY_PRODUCT_ID;
    if (!productId) {
      throw new Error("POLAR_PRO_MONTHLY_PRODUCT_ID가 설정되지 않았습니다");
    }
    const successUrl = process.env.SUCCESS_URL ?? `${request.nextUrl.origin}/billing`;

    const polar = createPolarClient();
    // externalCustomerId에 우리 user.id를 담아야 웹훅(step 9)이 결제를 내부 사용자와 연결할 수 있다(ADR-012).
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl,
      externalCustomerId: user.id,
    });

    const response: CheckoutStartResponse = { checkoutUrl: checkout.url };
    return Response.json(response, { status: 200 });
  } catch {
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}
