-- Defense-in-depth: purchase master trigger is internal-only.
-- It is invoked by the purchases trigger and must not be callable as a public RPC.
revoke execute on function public.fn_purchase_master_logic() from public;
revoke execute on function public.fn_purchase_master_logic() from anon;
revoke execute on function public.fn_purchase_master_logic() from authenticated;
