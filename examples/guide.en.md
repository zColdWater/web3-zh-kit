# Before you send USDC on Base

A 60-second checklist for new users. Most losses happen **before** the transaction, not after.

## 1. Check the network

Make sure your wallet is on Base mainnet (chain ID `8453`). Sending to the right address on the wrong network is the most common mistake.

## 2. Check the address

- Compare the first **and** last 6 characters, not just the first few.
- Watch out for address poisoning: scammers send you tiny transfers from look-alike addresses.
- Never copy an address from your transaction history.

## 3. Check the token

The official USDC contract on Base is listed at https://developers.circle.com/stablecoins/usdc-contract-addresses — anything else is not USDC.

```bash
# read the token symbol with cast (Foundry)
cast call 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 "symbol()(string)" --rpc-url https://mainnet.base.org
```

## 4. Review approvals

If a site asks you to approve unlimited spending, stop. Revoke old approvals regularly.
