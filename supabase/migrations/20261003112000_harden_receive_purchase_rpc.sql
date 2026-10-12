-- Harden purchase receiving RPC against cross-tenant calls.
-- The RPC is SECURITY DEFINER because the purchase receive trigger performs
-- canonical stock/ledger/supplier updates, so the function must enforce the
-- authenticated user's company explicitly.

create or replace function public.rpc_receive_purchase(
  p_company_id uuid,
  p_purchase_id uuid,
  p_received_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_purchase record;
  v_now timestamptz := now();
  v_my_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.company_id into v_my_company_id
  from public.profiles p
  where p.auth_user_id = auth.uid()::text
    and p.is_deleted = false
  limit 1;

  if v_my_company_id is null or p_company_id is null or v_my_company_id <> p_company_id then
    raise exception 'Forbidden: company context does not match authenticated user' using errcode = '42501';
  end if;

  if p_purchase_id is null then
    raise exception 'purchase_id is required';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Purchase not found: id=% company=%', p_purchase_id, p_company_id;
  end if;

  if coalesce(v_purchase.is_received, false) = true then
    raise exception 'Purchase % already received (po_no=%, received_at=%)',
      p_purchase_id, v_purchase.po_no, v_purchase.received_at;
  end if;

  update public.purchases
     set is_received = true,
         received_at = v_now,
         received_by = p_received_by
   where id = p_purchase_id;

  return jsonb_build_object(
    'success', true,
    'purchase_id', p_purchase_id,
    'po_no', v_purchase.po_no,
    'received_at', v_now,
    'received_by', p_received_by,
    'items_total', v_purchase.items_total,
    'transport_fee', coalesce(v_purchase.transport_fee, 0),
    'grand_total', v_purchase.grand_total,
    'amount_paid', v_purchase.amount_paid,
    'ledger_entry_group_id', (
      select entry_group_id from public.ledger
      where ref_id = p_purchase_id and company_id = p_company_id
      order by created_at desc limit 1
    ),
    'note', 'Stock + ledger + supplier balance က trg_purchase_master trigger က handle'
  );
end;
$function$;

revoke execute on function public.rpc_receive_purchase(uuid, uuid, text) from public;
grant execute on function public.rpc_receive_purchase(uuid, uuid, text) to authenticated;
