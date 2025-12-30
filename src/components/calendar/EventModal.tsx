'use client';

import { useState, useEffect } from 'react';
import { useEncryption } from '@/lib/hooks/useEncryption';

interface EventModalProps {
  eventId?: string | null;
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface EventData {
  title: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isAllDay: boolean;
  color: string;
  location: string;
  address: string;
  phone: string;
  notes: string;
}

const COLORS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
];

export function EventModal({ eventId, initialDate, onClose, onSaved }: EventModalProps) {
  const [formData, setFormData] = useState<EventData>({
    title: '',
    description: '',
    startDate: initialDate || new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endDate: initialDate || new Date().toISOString().split('T')[0],
    endTime: '10:00',
    isAllDay: false,
    color: '#6366f1',
    location: '',
    address: '',
    phone: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  useEffect(() => {
    if (eventId && isKeyReady) {
      fetchEvent();
    }
  }, [eventId, isKeyReady]);

  const fetchEvent = async () => {
    if (!eventId) return;

    try {
      const response = await fetch(`/api/calendar/${eventId}`);
      if (response.ok) {
        const data = await response.json();
        const event = data.event;

        const title = await decryptData(event.encryptedTitle, event.titleIv);
        let description = '';
        if (event.encryptedDescription && event.descriptionIv) {
          description = await decryptData(event.encryptedDescription, event.descriptionIv);
        }
        let location = '';
        if (event.encryptedLocation && event.locationIv) {
          location = await decryptData(event.encryptedLocation, event.locationIv);
        }
        let address = '';
        if (event.encryptedAddress && event.addressIv) {
          address = await decryptData(event.encryptedAddress, event.addressIv);
        }
        let phone = '';
        if (event.encryptedPhone && event.phoneIv) {
          phone = await decryptData(event.encryptedPhone, event.phoneIv);
        }
        let notes = '';
        if (event.encryptedNotes && event.notesIv) {
          notes = await decryptData(event.encryptedNotes, event.notesIv);
        }

        setFormData({
          title,
          description,
          startDate: event.startDate,
          startTime: event.startTime || '09:00',
          endDate: event.endDate || event.startDate,
          endTime: event.endTime || '10:00',
          isAllDay: event.isAllDay,
          color: event.color,
          location,
          address,
          phone,
          notes,
        });
      }
    } catch (error) {
      console.error('Failed to fetch event:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isKeyReady || !formData.title.trim()) return;

    setLoading(true);
    try {
      const { ciphertext: encryptedTitle, iv: titleIv } = await encryptData(formData.title);
      let encryptedDescription = null;
      let descriptionIv = null;
      let encryptedLocation = null;
      let locationIv = null;
      let encryptedAddress = null;
      let addressIv = null;
      let encryptedPhone = null;
      let phoneIv = null;
      let encryptedNotes = null;
      let notesIv = null;

      if (formData.description.trim()) {
        const encrypted = await encryptData(formData.description);
        encryptedDescription = encrypted.ciphertext;
        descriptionIv = encrypted.iv;
      }
      if (formData.location.trim()) {
        const encrypted = await encryptData(formData.location);
        encryptedLocation = encrypted.ciphertext;
        locationIv = encrypted.iv;
      }
      if (formData.address.trim()) {
        const encrypted = await encryptData(formData.address);
        encryptedAddress = encrypted.ciphertext;
        addressIv = encrypted.iv;
      }
      if (formData.phone.trim()) {
        const encrypted = await encryptData(formData.phone);
        encryptedPhone = encrypted.ciphertext;
        phoneIv = encrypted.iv;
      }
      if (formData.notes.trim()) {
        const encrypted = await encryptData(formData.notes);
        encryptedNotes = encrypted.ciphertext;
        notesIv = encrypted.iv;
      }

      const payload = {
        encryptedTitle,
        titleIv,
        encryptedDescription,
        descriptionIv,
        startDate: formData.startDate,
        startTime: formData.isAllDay ? null : formData.startTime,
        endDate: formData.endDate,
        endTime: formData.isAllDay ? null : formData.endTime,
        isAllDay: formData.isAllDay,
        color: formData.color,
        encryptedLocation,
        locationIv,
        encryptedAddress,
        addressIv,
        encryptedPhone,
        phoneIv,
        encryptedNotes,
        notesIv,
      };

      const url = eventId ? `/api/calendar/${eventId}` : '/api/calendar';
      const method = eventId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onSaved();
        onClose();
      }
    } catch (error) {
      console.error('Failed to save event:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!eventId || !confirm('Are you sure you want to delete this event?')) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/calendar/${eventId}`, { method: 'DELETE' });
      if (response.ok) {
        onSaved();
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {eventId ? 'Edit Event' : 'New Event'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Event title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Event description (optional)"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isAllDay"
              checked={formData.isAllDay}
              onChange={(e) => setFormData({ ...formData, isAllDay: e.target.checked })}
              className="rounded text-teal-600"
            />
            <label htmlFor="isAllDay" className="text-sm text-gray-700">All day event</label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            {!formData.isAllDay && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            {!formData.isAllDay && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: color.value })}
                  className={`w-8 h-8 rounded-full ${
                    formData.color === color.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Location & Venue */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Location Details</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Venue/Location Name</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Conference Room A"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., 123 Main St, City"
                />
              </div>
            </div>
          </div>

          {/* Contact & Notes */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Contact & Notes</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone Contact</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., +1 555-123-4567"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Additional Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            {eventId ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.title.trim()}
                className="px-4 py-2 text-white rounded-md disabled:opacity-50"
                style={{ backgroundColor: (loading || !formData.title.trim()) ? undefined : '#1aaeae' }}
                onMouseOver={(e) => { if (!loading && formData.title.trim()) e.currentTarget.style.backgroundColor = '#158f8f'; }}
                onMouseOut={(e) => { if (!loading && formData.title.trim()) e.currentTarget.style.backgroundColor = '#1aaeae'; }}
              >
                {loading ? 'Saving...' : eventId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
