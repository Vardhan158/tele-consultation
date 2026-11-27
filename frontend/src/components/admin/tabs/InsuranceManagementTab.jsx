import { useState } from "react";
import InsuranceClaimsTab from "./InsuranceClaimsTab";
import InsuranceProvidersTab from "./InsuranceProvidersTab";

export default function InsuranceManagementTab({ defaultSubTab = "claims", initialClaimId = null }) {
  const [activeSubTab, setActiveSubTab] = useState(defaultSubTab);

  return (
    <div className="space-y-6">
      {/* Subtab Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveSubTab("claims")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSubTab === "claims"
              ? "bg-[#185A4D] text-white shadow-xs"
              : "bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          <span className="material-symbols-outlined text-base">fact_check</span>
          <span>Insurance Claims Verification</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("providers")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSubTab === "providers"
              ? "bg-[#185A4D] text-white shadow-xs"
              : "bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          <span className="material-symbols-outlined text-base">domain</span>
          <span>Insurance Providers Master</span>
        </button>
      </div>

      {/* Render Selected Subtab */}
      {activeSubTab === "claims" ? (
        <InsuranceClaimsTab initialClaimId={initialClaimId} />
      ) : (
        <InsuranceProvidersTab />
      )}
    </div>
  );
}
