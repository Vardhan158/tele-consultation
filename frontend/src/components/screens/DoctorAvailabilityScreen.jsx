import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";

export default function DoctorAvailabilityScreen() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ starts_at: "", ends_at: "" });
  const [message, setMessage] = useState("");
  const load = () =>
    doctorApi
      .availability()
      .then(setItems)
      .catch((err) => setMessage(err.message));
  useEffect(() => {
    load();
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await doctorApi.createAvailability({
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
      });
      setForm({ starts_at: "", ends_at: "" });
      setMessage("Availability saved.");
      load();
    } catch (err) {
      setMessage(err.message);
    }
  };
  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-5">
      <h1 className="text-3xl font-bold">Availability</h1>
      <form
        onSubmit={submit}
        className="rounded-2xl bg-white p-5 border border-[#577877]/15 flex flex-wrap gap-3 items-end"
      >
        <label className="text-sm">
          Starts
          <input
            required
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            className="block mt-1 rounded-lg border p-2"
          />
        </label>
        <label className="text-sm">
          Ends
          <input
            required
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            className="block mt-1 rounded-lg border p-2"
          />
        </label>
        <button className="btn-primary" type="submit">
          Add slot
        </button>
      </form>
      {message && <p className="text-sm text-[#25836F]">{message}</p>}
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl bg-white p-4 border border-[#577877]/15"
          >
            {new Date(item.starts_at).toLocaleString()} –{" "}
            {new Date(item.ends_at).toLocaleTimeString()} · {item.status}
          </div>
        ))}
      </div>
    </div>
  );
}
