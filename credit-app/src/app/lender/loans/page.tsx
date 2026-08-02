"use client";

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listLoans } from '@/lib/api/loans';
import { useSession } from '@/context/SessionContext';
import { formatCurrency } from '@/lib/api/types';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { Icon } from '@/components/ui/Icon';

export default function LenderLoansPage() {
  const { session } = useSession();

  const { data: loans = [], isLoading, error } = useQuery({
    queryKey: ['lender-loans', session?.id],
    queryFn: () => listLoans({ lender_id: session?.id }),
    enabled: !!session?.id,
  });

  return (
    <div className="flex-1 bg-editorial-grid py-12 px-6 font-mono text-text-primary">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 border-b border-text-secondary/15 pb-6">
          <h1 className="font-mono text-xs uppercase tracking-widest text-accent font-bold mb-3">
            Portfolio
          </h1>
          <h2 className="font-mono text-3xl font-extrabold uppercase flex items-center gap-3">
            Loans Overview
          </h2>
        </div>

        {error && (
          <p className="mb-8 font-mono text-xs text-danger border border-danger/30 bg-danger/5 p-3">
            Failed to load loans.
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <span className="animate-spin"><Icon name="refresh-cw" size={24} /></span>
          </div>
        ) : loans.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-text-secondary/20">
            <p className="text-text-secondary font-mono text-sm uppercase tracking-widest">No loans issued yet</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {loans.map((loan) => (
              <Card key={loan.id} role="lender" className="flex flex-col">
                <div className="flex items-center justify-between mb-4 border-b border-text-primary/10 pb-4">
                  <h2 className="font-mono text-xl font-bold uppercase tracking-wider">Loan #{loan.id}</h2>
                  <StatusDot status={loan.status} />
                </div>
                <ul className="text-sm space-y-3 mb-6 flex-1 text-text-secondary">
                  <li className="flex justify-between">
                    <span className="opacity-60 uppercase tracking-wider text-xs">Agent ID:</span> 
                    <span className="font-bold text-text-primary">{loan.agent_id}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="opacity-60 uppercase tracking-wider text-xs">Amount:</span> 
                    <span className="font-bold text-text-primary">${formatCurrency(loan.principal_amount)}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="opacity-60 uppercase tracking-wider text-xs">Balance:</span> 
                    <span className="font-bold text-text-primary">${formatCurrency(loan.outstanding_balance)}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="opacity-60 uppercase tracking-wider text-xs">Issued:</span> 
                    <span className="font-bold text-text-primary">{new Date(loan.created_at).toLocaleDateString()}</span>
                  </li>
                </ul>
                <Link href={`/lender/loans/${loan.id}`}
                  className="mt-auto block text-center px-4 py-2 bg-text-primary text-[#FDF3C8] font-bold text-xs uppercase tracking-widest hover:bg-accent transition-colors">
                  View Details →
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
