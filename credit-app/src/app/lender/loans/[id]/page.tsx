"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getLoanDetail } from "@/lib/api/loans";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

export default function LoanDetail() {
  const params = useParams();
  const idStr = Array.isArray(params.id) ? params.id[0] : params.id;
  const loanId = idStr ? parseInt(idStr, 10) : 0;

  const { data: loan, isLoading } = useQuery({
    queryKey: ['loan-detail', loanId],
    queryFn: () => getLoanDetail(loanId),
    enabled: !!loanId,
  });

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center py-20"><Icon name="refresh-cw" className="animate-spin" /></div>;
  }

  if (!loan) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-editorial-grid font-mono">
        <Icon name="broken-link" size={48} className="text-text-secondary mb-4" />
        <h2 className="text-xl uppercase font-bold text-text-primary">Loan Record Not Found</h2>
        <Link href="/lender/dashboard" className="mt-4">
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-editorial-grid py-12 px-6">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Back Link */}
        <Link 
          href="/lender/dashboard"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase text-text-secondary hover:text-text-primary transition-colors"
        >
          <Icon name="arrow-left" size={14} />
          <span>Back to Lender Dashboard</span>
        </Link>

        {/* Title */}
        <div className="border-b border-text-secondary/15 pb-6">
          <h1 className="font-mono text-xs uppercase tracking-widest text-text-secondary mb-1">
            TRANSACTION HISTORY RECORD
          </h1>
          <h2 className="font-mono text-3xl font-extrabold text-text-primary uppercase">
            Loan: #{loan.id}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8">
          
          {/* Summary */}
          <div className="space-y-6">
            
            <Card role="none" className="space-y-4">
              <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary font-bold border-b border-text-secondary/10 pb-2">
                Loan Summary
              </h3>

              <div className="grid grid-cols-2 gap-4 font-mono text-xs text-text-secondary">
                <div>
                  <span className="block text-[10px] text-text-secondary/70 uppercase">Amount Requested</span>
                  <span className="font-bold text-text-primary text-base">${loan.principal_amount.toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-text-secondary/70 uppercase">Transaction Status</span>
                  <span className={`font-bold uppercase ${
                    loan.status === "repaid" ? "text-base" : 
                    loan.status === "approved" ? "text-accent" : "text-danger"
                  }`}>{loan.status}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-text-secondary/70 uppercase">Agent ID</span>
                  <span className="font-bold text-text-primary uppercase">{loan.agent_id}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-text-secondary/70 uppercase">Issuance Date</span>
                  <span className="font-bold text-text-primary">{new Date(loan.issued_at).toLocaleString()}</span>
                </div>
              </div>
            </Card>

          </div>
        </div>

      </div>
    </div>
  );
}
