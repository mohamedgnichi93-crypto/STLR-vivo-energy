import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get("WATTNOW_API_KEY");
    if (!API_KEY) {
      throw new Error("WATTNOW_API_KEY is not configured");
    }

    const { dn, startDate, endDate, granularity } = await req.json();

    if (!dn || !startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: dn, startDate, endDate" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const interval = granularity === "hourly" ? "hourly" : "daily";
    const url = `https://2m543660yi.execute-api.us-east-1.amazonaws.com/prod/apis.wattnow.io/data/v1/device/${interval}/electricity/us-east-1:0e1c5129-884a-4d25-9ec3-cbfc458a62f6/${dn}/${startDate}/${endDate}`;

    const response = await fetch(url, {
      headers: { "x-api-key": API_KEY },
    });

    if (!response.ok) {
      throw new Error(`Wattnow API error [${response.status}]: ${await response.text()}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in wattnow-proxy:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
