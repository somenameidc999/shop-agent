import { useState, useCallback, useEffect, useRef } from "react";
import { SetupGuideModal } from "./SetupGuideModal";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "number";
  required: boolean;
  sensitive: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface FormProps {
  instanceName: string;
  savedValues: Record<string, string>;
  hasConfig: boolean;
  enabled: boolean;
  isNew?: boolean;
  onSave: (
    serverType: string,
    instanceName: string,
    values: Record<string, string>,
    enabled: boolean,
  ) => void;
  onDelete: (serverType: string, instanceName: string) => void;
  onCancelNew?: () => void;
  saving: boolean;
}

interface ServerConfigFormProps extends FormProps {
  serverType: string;
  label: string;
  description: string;
  fields: FieldDef[];
}

function buildInitialValues(
  fields: FieldDef[],
  savedValues: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    result[field.key] = savedValues[field.key] ?? field.defaultValue ?? "";
  }
  return result;
}

export function ServerConfigForm({
  serverType,
  label,
  description,
  fields,
  instanceName: initialInstanceName,
  savedValues,
  hasConfig,
  enabled,
  isNew,
  onSave,
  onDelete,
  onCancelNew,
  saving,
}: ServerConfigFormProps) {
  const [expanded, setExpanded] = useState(!!isNew);
  const [guideOpen, setGuideOpen] = useState(false);
  const [values, setValues] = useState(() =>
    buildInitialValues(fields, savedValues),
  );
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [connName, setConnName] = useState(
    initialInstanceName === "default" && isNew ? "" : initialInstanceName,
  );

  const prevSavedRef = useRef(savedValues);
  useEffect(() => {
    if (prevSavedRef.current !== savedValues) {
      prevSavedRef.current = savedValues;
      setValues(buildInitialValues(fields, savedValues));
      setIsEnabled(enabled);
    }
  }, [savedValues, enabled, fields]);

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const finalName = connName.trim() || "default";
    onSave(serverType, finalName, values, isEnabled);
    setExpanded(false);
  }, [serverType, connName, values, isEnabled, onSave]);

  const handleDelete = useCallback(() => {
    onDelete(serverType, initialInstanceName);
    setExpanded(false);
  }, [serverType, initialInstanceName, onDelete]);

  const handleCancel = useCallback(() => {
    if (isNew && onCancelNew) {
      onCancelNew();
    } else {
      setExpanded(false);
    }
  }, [isNew, onCancelNew]);

  const displayName =
    initialInstanceName && initialInstanceName !== "default"
      ? `${label} — ${initialInstanceName}`
      : label;

  const statusBadge = hasConfig ? (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        background: enabled ? "#c8f7dc" : "#fce4e4",
        color: enabled ? "#1a7a3a" : "#b42318",
      }}
    >
      {enabled ? "Connected" : "Disabled"}
    </span>
  ) : (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        background: "#f3f3f3",
        color: "#666",
      }}
    >
      Not configured
    </span>
  );

  return (
    <div
      style={{
        border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
        borderRadius: 8,
        marginBottom: 8,
        background: "var(--s-color-bg-surface, #fff)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded(!expanded);
        }}
        role="button"
        tabIndex={0}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              {description}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isNew && statusBadge}
          <button
            type="button"
            title="How to connect"
            aria-label={`Setup guide for ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              setGuideOpen(true);
            }}
            style={{
              all: "unset",
              cursor: "pointer",
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: "1px solid #ccc",
              fontSize: 13,
              fontWeight: 700,
              color: "#666",
              lineHeight: 1,
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f0fdf4";
              e.currentTarget.style.borderColor = "#008060";
              e.currentTarget.style.color = "#008060";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "#ccc";
              e.currentTarget.style.color = "#666";
            }}
          >
            ?
          </button>
          <span style={{ fontSize: 12, color: "#999" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      <SetupGuideModal
        serverType={serverType}
        label={label}
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />

      {expanded && (
        <div
          style={{
            padding: "0 16px 16px",
            borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
          }}
        >
          <div style={{ marginTop: 12 }}>
            {/* Connection Name */}
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor={`${serverType}-${initialInstanceName}-connName`}
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "#333",
                }}
              >
                Connection Name
                <span style={{ color: "#b42318" }}> *</span>
              </label>
              <input
                id={`${serverType}-${initialInstanceName}-connName`}
                type="text"
                value={connName}
                onChange={(e) => setConnName(e.target.value)}
                placeholder="e.g. Production, Staging, Client A"
                disabled={hasConfig && !isNew}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                  background: hasConfig && !isNew ? "#f6f6f7" : undefined,
                }}
              />
              {hasConfig && !isNew && (
                <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                  Name cannot be changed after creation
                </div>
              )}
            </div>

            {fields.map((field) => (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <label
                  htmlFor={`${serverType}-${initialInstanceName}-${field.key}`}
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 4,
                    color: "#333",
                  }}
                >
                  {field.label}
                  {field.required && (
                    <span style={{ color: "#b42318" }}> *</span>
                  )}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    id={`${serverType}-${initialInstanceName}-${field.key}`}
                    value={values[field.key] ?? ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={6}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      fontSize: 13,
                      fontFamily: "monospace",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <input
                    id={`${serverType}-${initialInstanceName}-${field.key}`}
                    type={field.type === "password" ? "password" : "text"}
                    value={values[field.key] ?? ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      fontSize: 13,
                      boxSizing: "border-box",
                      fontFamily:
                        field.type === "password" ? "inherit" : "monospace",
                    }}
                  />
                )}
              </div>
            ))}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <input
                type="checkbox"
                id={`${serverType}-${initialInstanceName}-enabled`}
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
              />
              <label
                htmlFor={`${serverType}-${initialInstanceName}-enabled`}
                style={{ fontSize: 13, cursor: "pointer" }}
              >
                Enable this server
              </label>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving || !connName.trim()}
                style={{
                  padding: "8px 16px",
                  background: "#008060",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: saving || !connName.trim() ? "not-allowed" : "pointer",
                  opacity: saving || !connName.trim() ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : "Save & Connect"}
              </button>
              {hasConfig && !isNew && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  style={{
                    padding: "8px 16px",
                    background: "#fff",
                    color: "#b42318",
                    border: "1px solid #b42318",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  Remove
                </button>
              )}
              <button
                onClick={handleCancel}
                style={{
                  padding: "8px 16px",
                  background: "#f6f6f7",
                  color: "#333",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
