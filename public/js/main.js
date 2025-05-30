document.addEventListener("DOMContentLoaded", () => {
  // Initialize Materialize components
  if (typeof M !== "undefined") {
    M.AutoInit()

    // Initialize sidenav
    const sidenavElems = document.querySelectorAll(".sidenav")
    const sidenavInstances = M.Sidenav.init(sidenavElems)

    // Initialize modals
    const modalElems = document.querySelectorAll(".modal")
    const modalInstances = M.Modal.init(modalElems)

    // Initialize date pickers
    const dateElems = document.querySelectorAll(".datepicker")
    const dateInstances = M.Datepicker.init(dateElems, {
      format: "yyyy-mm-dd",
      autoClose: true,
    })

    // Initialize selects
    const selectElems = document.querySelectorAll("select")
    const selectInstances = M.FormSelect.init(selectElems)
  }

  // Auto search functionality
  const searchInput = document.getElementById("search-input")
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      debounce(function () {
        if (this.value.length >= 2) {
          window.location.href = "/search?query=" + encodeURIComponent(this.value)
        }
      }, 500),
    )
  }

  // Table filter functionality
  const tableFilter = document.getElementById("table-filter")
  if (tableFilter) {
    tableFilter.addEventListener("input", function () {
      const searchText = this.value.toLowerCase()
      const tableRows = document.querySelectorAll(".data-table tbody tr")

      tableRows.forEach((row) => {
        // Skip detail rows
        if (row.classList.contains("goal-detail-row")) return

        const text = row.textContent.toLowerCase()
        if (text.includes(searchText)) {
          row.style.display = ""
        } else {
          row.style.display = "none"
        }
      })
    })
  }

  // Date range filter
  const startDateFilter = document.getElementById("start-date")
  const endDateFilter = document.getElementById("end-date")

  if (startDateFilter && endDateFilter) {
    const applyDateFilter = () => {
      const startDate = startDateFilter.value ? new Date(startDateFilter.value) : null
      const endDate = endDateFilter.value ? new Date(endDateFilter.value) : null

      if (!startDate && !endDate) return

      const tableRows = document.querySelectorAll(".data-table tbody tr")

      tableRows.forEach((row) => {
        // Skip detail rows
        if (row.classList.contains("goal-detail-row")) return

        const dateCell = row.querySelector("td:nth-child(3)")
        if (!dateCell) return

        const rowDate = new Date(dateCell.textContent)

        let showRow = true
        if (startDate && rowDate < startDate) showRow = false
        if (endDate && rowDate > endDate) showRow = false

        row.style.display = showRow ? "" : "none"
      })
    }

    startDateFilter.addEventListener("change", applyDateFilter)
    endDateFilter.addEventListener("change", applyDateFilter)
  }

  // Toggle sidebar on mobile
  const sidebarToggle = document.querySelector(".sidebar-toggle")
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      const sidebar = document.querySelector(".sidebar")
      sidebar.classList.toggle("open")
    })
  }

  // Handle delete confirmations
  const deleteButtons = document.querySelectorAll("[data-confirm]")
  if (deleteButtons) {
    deleteButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        if (!confirm(button.getAttribute("data-confirm"))) {
          e.preventDefault()
        }
      })
    })
  }
})

// Debounce function to limit how often a function can be called
function debounce(func, wait) {
  let timeout
  return function () {
    const args = arguments
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      func.apply(this, args)
    }, wait)
  }
}
